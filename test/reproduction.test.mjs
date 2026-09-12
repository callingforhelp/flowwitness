import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository, createJobs, createFakeClock } from '../src/platform/index.mjs';
import { createModule } from '../src/modules/reproduction/index.mjs';
const operator = { application: 'app', conversationId: 'one', subjectId: 'operator', role: 'operator' };
const agent = { ...operator, subjectId: 'worker', role: 'agent' };
const customer = { ...operator, subjectId: 'customer', role: 'customer' };
const status = code => error => error.status === code;
async function fixture(step = async () => ({ secret: 'DO_NOT_STORE' }), options = {}) {
  const clock = createFakeClock();
  const repository = await createMemoryRepository({ clock });
  const jobs = createJobs({ repository, config: { leaseMs: 1000 } });
  await repository.create(operator, 'agentCapabilities', { ownerId: agent.subjectId, enabled: true, capabilities: ['browser'] });
  const issue = await repository.create(operator, 'issues', { title: 'Preview bug' });
  let stopped = 0, destroyed = 0;
  const browser = { async start() { return { step, async stop() { stopped++; }, async destroy() { destroyed++; } }; } };
  const api = createModule({ repository, jobs, browser, clock, ...options });
  const input = { issueId: issue.id, approvalRef: 'approval-1', target: { origin: 'https://preview.example', environment: 'preview', revision: 'abc' }, steps: [{ action: 'click', selector: '#submit' }], idempotencyKey: 'key' };
  return { api, input, repository, jobs, clock, cleanup: () => [stopped, destroyed], async start() { const result = await api.create(operator, input); const job = await jobs.claim(agent, { capabilities: ['browser'] }); return { id: result.item.id, token: job.lease.token }; } };
}
test('validation rejects production, unsafe origins, arbitrary actions, secrets and excessive limits', async () => {
  const f = await fixture();
  for (const patch of [{ target: { ...f.input.target, environment: 'production' } }, { target: { ...f.input.target, origin: 'https://user:password@example.com' } }, { approvalRef: ' ' }, { idempotencyKey: '' }, { steps: [{ action: 'evaluate', value: 'code' }] }, { steps: [{ action: 'navigate', value: '//evil.example' }] }, { steps: Array(51).fill({ action: 'screenshot' }) }, { limits: { maxDurationMs: 600001 } }, { limits: { concurrency: 2 } }, { sessionSecretRef: 'raw-secret' }]) await assert.rejects(f.api.create(operator, { ...f.input, ...patch }), status(400));
});
test('roles, exact scopes, customer projection and idempotent concurrent creation', async () => {
  const f = await fixture();
  for (const p of [agent, customer]) await assert.rejects(f.api.create(p, f.input), status(403));
  const [a, b] = await Promise.all([f.api.create(operator, f.input), f.api.create(operator, f.input)]);
  assert.equal(a.job.id, b.job.id);
  await assert.rejects(f.api.create(operator, { ...f.input, approvalRef: 'different' }), status(409));
  for (const p of [{ ...operator, application: 'other' }, { ...operator, conversationId: 'two' }, { ...operator, conversationId: null }]) await assert.rejects(f.api.get(p, { id: a.item.id }), status(404));
  await assert.rejects(f.api.get({ ...customer, conversationId: null }, { id: a.item.id }), status(403));
  const read = await f.api.get(customer, { id: a.item.id });
  assert.equal(read.item.approvalRef, undefined); assert.equal(read.item.steps, undefined);
});
test('execution produces only unverified structural receipts and cleans VM', async () => {
  const f = await fixture(); const input = await f.start();
  const result = await f.api.run(agent, input);
  assert.equal(result.job.status, 'succeeded'); assert.equal(result.item.status, 'unverified');
  assert.equal(result.item.jobId, result.job.id);
  assert.equal(JSON.stringify(result).includes('DO_NOT_STORE'), false);
  assert.deepEqual(f.cleanup(), [1, 1]);
});
test('cancel and expired lease fence results and destroy session', async () => {
  for (const mode of ['cancel', 'expire']) {
    let f;
    f = await fixture(async () => {
      if (mode === 'cancel') { const { items } = await f.repository.query(operator, 'investigationJobs'); await f.jobs.cancel(operator, { id: items[0].id }); }
      else f.clock.advance(1001);
    });
    await assert.rejects(f.api.run(agent, await f.start()), status(409));
    assert.deepEqual(f.cleanup(), [1, 1]);
    assert.equal((await f.repository.query(operator, 'evidenceBundles')).items.length, 0);
  }
});
test('one application slot, deadline and cancellation interrupt hanging adapters', async () => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture(() => { entered(); return new Promise(() => {}); });
  const input = await f.start(); const controller = new AbortController();
  const running = f.api.run(agent, { ...input, signal: controller.signal });
  await ready;
  await assert.rejects(f.api.run(agent, input), status(429));
  controller.abort(); await assert.rejects(running, status(409)); assert.deepEqual(f.cleanup(), [1, 1]);
  const timed = await fixture(() => new Promise(() => {})); timed.input.limits = { maxDurationMs: 10 };
  await assert.rejects(timed.api.run(agent, await timed.start()), status(409)); assert.deepEqual(timed.cleanup(), [1, 1]);
});
test('optional adapter and route ownership', async () => {
  const f = await fixture(undefined, { browser: undefined });
  const { item } = await f.api.create(operator, f.input);
  await assert.rejects(f.api.run(agent, { id: item.id, token: 'token' }), status(503));
  assert.equal(await f.api.handle({ path: '/unknown', method: 'GET' }), null);
  assert.equal((await f.api.handle({ path: '/v1/reproductions', method: 'GET' })).status, 405);
  assert.equal((await f.api.handle({ path: `/v1/reproductions/${item.id}`, method: 'GET', principal: customer })).status, 200);
  assert.equal((await f.api.handle({ path: '/v1/reproductions', method: 'POST', principal: operator, body: f.input })).status, 202);
});
