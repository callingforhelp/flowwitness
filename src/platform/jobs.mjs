import { publicJob } from './job-model.mjs';
import { normalizeScope, assertStringArray, JOB_COLLECTION } from './records.mjs';
import { forbidden, unauthenticated, notFound, invalid } from './errors.mjs';

export function principalScope(principal, roles = ['operator', 'agent', 'customer']) {
  if (!principal?.subjectId || !principal?.application) throw unauthenticated();
  if (!roles.includes(principal.role)) throw forbidden();
  if (principal.role === 'customer' && !principal.conversationId) throw forbidden('Conversation binding required');
  return normalizeScope(principal);
}

export function createJobs({ repository, config = {}, validateResult } = {}) {
  const scopeFor = principal => principalScope(principal, ['operator', 'agent']);
  function project(principal, job) {
    const result = publicJob(job);
    if (result?.lease && result.lease.ownerId !== principal.subjectId) result.lease = { ownerId: result.lease.ownerId, expiresAt: result.lease.expiresAt };
    return result;
  }
  async function registered(principal, capabilities) {
    const scope = scopeFor(principal);
    const { items } = await repository.query(scope, 'agentCapabilities', { where: { ownerId: principal.subjectId, enabled: true }, limit: 100 });
    const allowed = new Set(items.flatMap(item => item.capabilities));
    if (!items.length || capabilities.some(capability => !allowed.has(capability))) throw forbidden('Registered capability required');
    return scope;
  }
  return {
    async enqueue(principal, input) {
      const scope = scopeFor(principal);
      return project(principal, await repository.enqueue(scope, {
        kind: input.kind, inputRef: input.inputRef,
        requiredCapabilities: input.requiredCapabilities ?? [],
        deadlineMs: config.deadlineMs ?? 600000, maxAttempts: config.maxAttempts ?? 3,
      }, { idempotencyKey: input.idempotencyKey, maxQueued: config.maxQueued ?? 100 }));
    },
    async get(principal, { id }) {
      const job = await repository.get(scopeFor(principal), JOB_COLLECTION, id);
      if (!job) throw notFound();
      const result = publicJob(job);
      if (result.lease?.ownerId !== principal.subjectId) result.lease = result.lease && { ownerId: result.lease.ownerId, expiresAt: result.lease.expiresAt };
      return result;
    },
    async claim(principal, { capabilities = [] } = {}) {
      capabilities = assertStringArray(capabilities, 'capabilities');
      const scope = await registered(principal, capabilities);
      return publicJob(await repository.claim(scope, { ownerId: principal.subjectId, capabilities, leaseMs: config.leaseMs }));
    },
    async heartbeat(principal, { id, token }) {
      const scope = await registered(principal, []);
      return (await repository.renew(scope, id, { ownerId: principal.subjectId, token, leaseMs: config.leaseMs })).lease;
    },
    async complete(principal, { id, token, resultRef }) {
      const scope = await registered(principal, []);
      const job = await repository.get(scope, JOB_COLLECTION, id);
      const result = resultRef && await repository.get(scope, resultRef.collection, resultRef.id);
      if (!result) throw notFound('Result not found');
      if (result.jobId !== id) throw invalid('Result must belong to this job');
      if (validateResult && !(await validateResult({ scope, job, result }))) throw invalid('Result validation failed');
      return publicJob(await repository.settle(scope, id, { ownerId: principal.subjectId, token, status: 'succeeded', resultRef }));
    },
    async fail(principal, { id, token, errorCode }) {
      const scope = await registered(principal, []);
      return publicJob(await repository.settle(scope, id, { ownerId: principal.subjectId, token, status: 'failed', errorCode }));
    },
    async cancel(principal, { id }) {
      const scope = scopeFor(principal);
      const job = await repository.get(scope, JOB_COLLECTION, id);
      if (!job) throw notFound();
      if (principal.role !== 'operator' && job.lease?.ownerId !== principal.subjectId) throw forbidden();
      return publicJob(await repository.cancel(scope, id));
    },
  };
}
