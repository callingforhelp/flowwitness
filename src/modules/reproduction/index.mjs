import { principalScope } from '../../platform/jobs.mjs';
import { canonicalHash, canonicalJson, sameScope } from '../../platform/records.mjs';
import { invalid, notFound, conflict, quota, unavailable } from '../../platform/errors.mjs';

const collection = 'reproductionRequests';
const text = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw invalid(`Invalid ${name}`);
  return v;
};
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw invalid('Unsupported input fields');
}
function normalize(input) {
  keys(input, ['issueId', 'target', 'approvalRef', 'steps', 'limits', 'idempotencyKey']);
  const issueId = text(input.issueId, 'issueId');
  const approvalRef = text(input.approvalRef, 'approvalRef');
  text(input.idempotencyKey, 'idempotencyKey');
  keys(input.target, ['origin', 'environment', 'revision']);
  let url;
  try { url = new URL(input.target.origin); } catch { throw invalid('Invalid target origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !['preview', 'test'].includes(input.target.environment)) throw invalid('Approved preview/test origin required');
  const target = { origin: url.origin, environment: input.target.environment, revision: text(input.target.revision, 'revision') };
  const limits = { concurrency: 1, maxDurationMs: 600000, maxActions: 50, ...input.limits };
  keys(limits, ['concurrency', 'maxDurationMs', 'maxActions']);
  if (limits.concurrency !== 1 || !Number.isInteger(limits.maxDurationMs) || limits.maxDurationMs < 1 || limits.maxDurationMs > 600000 || !Number.isInteger(limits.maxActions) || limits.maxActions < 1 || limits.maxActions > 50) throw invalid('Invalid reproduction limits');
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > limits.maxActions) throw invalid('Invalid action count');
  const steps = input.steps.map(step => {
    keys(step, ['action', 'selector', 'value']);
    if (!['click', 'assertVisible', 'screenshot', 'navigate'].includes(step.action)) throw invalid('Unsupported action');
    if (['click', 'assertVisible'].includes(step.action)) {
      if (step.value !== undefined) throw invalid('Action value forbidden');
      return { action: step.action, selector: text(step.selector, 'selector', 500) };
    }
    if (step.selector !== undefined) throw invalid('Selector forbidden');
    if (step.action === 'screenshot') {
      if (step.value !== undefined) throw invalid('Action value forbidden');
      return { action: step.action };
    }
    const path = text(step.value, 'navigation path', 1000);
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('?') || path.includes('#') || new URL(path, target.origin).origin !== target.origin) throw invalid('Same-origin path required');
    return { action: step.action, value: path };
  });
  return { issueId, target, approvalRef, steps, limits };
}

/** Browser adapter: start({scope,target,approvalRef,limits,signal}) -> session.
 * Session: step(step,{signal}), optional stop(), destroy(). Raw output is discarded.
 * Adapter must enforce approved origins, redirects, private session resolution and hard limits.
 */
export function createModule({ repository, jobs, browser, config = {}, clock = { now: () => Date.now() } }) {
  const active = new Set();
  const now = () => Number(clock.now());
  const scoped = async (scope, id) => {
    const item = await repository.get(scope, collection, text(id, 'id'));
    if (!item || !sameScope(scope, item)) throw notFound();
    return item;
  };
  const project = (principal, item) => principal.role === 'customer'
    ? Object.fromEntries(['schemaVersion', 'id', 'application', 'conversationId', 'version', 'createdAt', 'updatedAt', 'issueId', 'jobId'].map(k => [k, item[k]]))
    : item;
  const api = {
    async create(principal, input) {
      const scope = principalScope(principal, ['operator']);
      const data = normalize(input);
      const issue = await repository.get(scope, 'issues', data.issueId);
      if (!issue || !sameScope(scope, issue)) throw notFound('Issue not found');
      const id = `repro_${canonicalHash({ scope, key: input.idempotencyKey })}`;
      let item = await repository.get(scope, collection, id);
      if (!item) {
        try { item = await repository.create(scope, collection, { id, ...data, jobId: null }); }
        catch (error) { if (error.status !== 409) throw error; item = await scoped(scope, id); }
      }
      if (canonicalJson(Object.fromEntries(Object.keys(data).map(k => [k, item[k]]))) !== canonicalJson(data)) throw conflict('Idempotency key already used');
      const job = await jobs.enqueue(principal, { kind: 'reproduction', inputRef: { collection, id }, requiredCapabilities: ['browser'], idempotencyKey: input.idempotencyKey });
      if (item.jobId !== job.id) {
        try { item = await repository.update(scope, collection, id, { expectedVersion: item.version, patch: { jobId: job.id } }); }
        catch (error) { if (error.status !== 409) throw error; item = await scoped(scope, id); if (item.jobId !== job.id) throw error; }
      }
      return { item: project(principal, item), job };
    },
    async get(principal, { id }) {
      const scope = principalScope(principal);
      return { item: project(principal, await scoped(scope, id)) };
    },
    async run(principal, { id, token, signal } = {}) {
      const scope = principalScope(principal, ['operator', 'agent']);
      if (!browser?.start) throw unavailable('Browser adapter unavailable');
      const item = await scoped(scope, id);
      text(token, 'lease token');
      const slot = scope.application;
      if (active.has(slot)) throw quota('Reproduction slot occupied');
      active.add(slot);
      let session, evidence, timer, heartbeat, cleanupPromise;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      let rejectAbort;
      const aborted = new Promise((_, reject) => { rejectAbort = reject; });
      aborted.catch(() => {});
      const deadline = now() + item.limits.maxDurationMs;
      const cleanup = () => {
        if (!session) return Promise.resolve();
        cleanupPromise ??= (async () => {
          try { await session.stop?.(); } catch {}
          try { await session.destroy?.(); } catch {}
        })();
        return cleanupPromise;
      };
      controller.signal.addEventListener('abort', () => { rejectAbort(conflict('Execution interrupted')); void cleanup(); }, { once: true });
      const guard = async () => {
        if (controller.signal.aborted || now() >= deadline) throw conflict('Execution interrupted');
        await jobs.heartbeat(principal, { id: item.jobId, token });
      };
      const race = promise => Promise.race([promise, aborted]);
      try {
        await guard();
        timer = setTimeout(abort, item.limits.maxDurationMs);
        heartbeat = setInterval(() => { guard().catch(abort); }, Math.max(1, Math.min(config.heartbeatMs ?? 20000, 20000)));
        const starting = Promise.resolve(browser.start({ scope, target: item.target, approvalRef: item.approvalRef, limits: item.limits, signal: controller.signal }));
        starting.then(value => { session = value; if (controller.signal.aborted) void cleanup(); }, () => {});
        session = await race(starting);
        const observations = [];
        for (const [index, step] of item.steps.entries()) {
          await guard();
          await race(Promise.resolve(session.step(step, { signal: controller.signal })));
          await guard();
          observations.push({ index, action: step.action, outcome: 'completed' });
        }
        await guard();
        evidence = await repository.create(scope, 'evidenceBundles', {
          jobId: item.jobId, target: item.target, observations, artifactIds: [], status: 'unverified',
          validatorVersion: 'reproduction-receipts-v1', recordedAt: new Date(now()).toISOString(), expiresAt: new Date(now() + 86400000).toISOString(),
        });
        await guard();
        const job = await jobs.complete(principal, { id: item.jobId, token, resultRef: { collection: 'evidenceBundles', id: evidence.id } });
        return { job, item: evidence };
      } catch {
        if (evidence) await repository.remove(scope, 'evidenceBundles', evidence.id, { expectedVersion: evidence.version }).catch(() => {});
        await jobs.fail(principal, { id: item.jobId, token, errorCode: 'reproduction_failed' }).catch(() => {});
        throw conflict('Reproduction execution failed');
      } finally {
        clearTimeout(timer); clearInterval(heartbeat);
        signal?.removeEventListener('abort', abort);
        await cleanup(); active.delete(slot);
      }
    },
    async handle(ctx) {
      const match = /^\/v1\/reproductions\/([^/]+)$/.exec(ctx.path);
      if (ctx.path !== '/v1/reproductions' && !match) return null;
      if (ctx.path === '/v1/reproductions' && ctx.method === 'POST') return { status: 202, body: await api.create(ctx.principal, ctx.body) };
      if (match && ctx.method === 'GET') return { status: 200, body: await api.get(ctx.principal, { id: match[1] }) };
      return { status: 405, body: { error: { code: 'method_not_allowed', message: 'Method not allowed' }, requestId: ctx.requestId } };
    },
  };
  return api;
}
