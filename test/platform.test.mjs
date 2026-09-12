import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMemoryRepository, createLocalRepository, createFakeClock, createLocalArtifacts, createJobs, createInsForgeAdminRepository } from '../src/platform/index.mjs';

const scope = { application: 'a', conversationId: 'one' };
const conflict = error => error.status === 409;
async function input(repo, s = scope) { return repo.create(s, 'issues', { title: '问题', description: 'A report' }); }
async function enqueue(repo, record, options = {}) {
  return repo.enqueue(scope, { kind: 'investigation', inputRef: { collection: 'issues', id: record.id }, requiredCapabilities: ['browser'], ...options }, { idempotencyKey: options.key ?? 'one' });
}
function conformance(name, factory) {
  test(`${name}: scope, query, cursor and concurrent CAS`, async () => {
    const repo = await factory();
    try {
      const record = await input(repo);
      for (const other of [{ application: 'b', conversationId: 'one' }, { application: 'a', conversationId: 'two' }, { application: 'a', conversationId: null }]) {
        assert.equal(await repo.get(other, 'issues', record.id), null);
        assert.equal((await repo.query(other, 'issues')).items.length, 0);
      }
      const results = await Promise.allSettled([1, 2].map(n => repo.update(scope, 'issues', record.id, { expectedVersion: 1, patch: { description: String(n) } })));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
      assert.equal((await repo.query(scope, 'issues', { text: '问题' })).items.length, 1);
      await input(repo);
      const first = await repo.query(scope, 'issues', { limit: 1 });
      assert.ok(first.nextCursor);
      assert.equal((await repo.query(scope, 'issues', { limit: 1, cursor: first.nextCursor })).items.length, 1);
      await assert.rejects(repo.query({ ...scope, conversationId: 'two' }, 'issues', { cursor: first.nextCursor }), error => error.status === 400);
    } finally { await repo.close(); }
  });
  test(`${name}: atomic claims, dedupe, fencing, cancel and deadline`, async () => {
    const clock = createFakeClock(); const repo = await factory(clock);
    try {
      const record = await input(repo); const job = await enqueue(repo, record);
      clock.advance(500);
      assert.equal((await enqueue(repo, record)).id, job.id);
      await assert.rejects(enqueue(repo, record, { requiredCapabilities: ['other'] }), conflict);
      const claims = await Promise.all(['worker1', 'worker2'].map(ownerId => repo.claim(scope, { ownerId, capabilities: ['browser'], leaseMs: 1000 })));
      assert.equal(claims.filter(Boolean).length, 1); const old = claims.find(Boolean);
      clock.advance(1001);
      const next = await repo.claim(scope, { ownerId: 'worker3', capabilities: ['browser'], leaseMs: 1000 });
      assert.notEqual(next.lease.token, old.lease.token);
      await assert.rejects(repo.renew(scope, job.id, { ...old.lease, leaseMs: 1000 }), conflict);
      await repo.cancel(scope, job.id);
      await assert.rejects(repo.settle(scope, job.id, { ...next.lease, status: 'failed', errorCode: 'late' }), conflict);
      const deadline = await enqueue(repo, record, { key: 'deadline', deadlineMs: 1000 });
      clock.advance(1001); assert.equal(await repo.claim(scope, { ownerId: 'x', capabilities: ['browser'] }), null);
      assert.equal((await repo.get(scope, 'investigationJobs', deadline.id)).errorCode, 'deadline_exceeded');
      const exhausted = await enqueue(repo, record, { key: 'exhausted', maxAttempts: 1 });
      await repo.claim(scope, { ownerId: 'x', capabilities: ['browser'], leaseMs: 1000 }); clock.advance(1001);
      assert.equal(await repo.claim(scope, { ownerId: 'x', capabilities: ['browser'] }), null);
      assert.equal((await repo.get(scope, 'investigationJobs', exhausted.id)).errorCode, 'attempts_exhausted');
    } finally { await repo.close(); }
  });
}
conformance('memory', clock => createMemoryRepository({ clock }));
conformance('durable', async clock => {
  const dir = await mkdtemp(path.join(tmpdir(), 'platform-'));
  const repo = await createLocalRepository({ dir, clock }); const close = repo.close.bind(repo);
  repo.close = async () => { await close(); await rm(dir, { recursive: true, force: true }); }; return repo;
});

test('durable restart preserves versions and lease fencing; exclusive writer', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'platform-restart-')); const clock = createFakeClock();
  let repo = await createLocalRepository({ dir, clock });
  try {
    const record = await input(repo); const job = await enqueue(repo, record);
    const lease = await repo.claim(scope, { ownerId: 'x', capabilities: ['browser'] });
    await assert.rejects(createLocalRepository({ dir, clock }), /locked/);
    await repo.close(); repo = await createLocalRepository({ dir, clock });
    assert.equal((await repo.get(scope, 'investigationJobs', job.id)).lease.token, lease.lease.token);
    assert.equal((await repo.get(scope, 'issues', record.id)).version, 1);
  } finally { await repo.close(); await rm(dir, { recursive: true, force: true }); }
});

test('artifacts fence uploads, expire, isolate scopes and invalidate every link', async () => {
  const clock = createFakeClock(), repo = await createMemoryRepository({ clock });
  const artifacts = createLocalArtifacts({ repository: repo, ttlMs: 5000 });
  const record = await input(repo), job = await enqueue(repo, record);
  const leased = await repo.claim(scope, { ownerId: 'x', capabilities: ['browser'] });
  const put = () => artifacts.put(scope, { jobId: job.id, leaseToken: leased.lease.token, kind: 'screenshot', mediaType: 'image/png', bytes: Buffer.from('private') });
  const item = await put(); const link = await artifacts.link(scope, item.id, { expiresInMs: 10000 });
  assert.equal(link.expiresAt, item.expiresAt);
  const token = new URL(link.url, 'http://local').searchParams.get('token');
  assert.equal((await artifacts.readLink(scope, item.id, token)).read().toString(), 'private');
  assert.equal(await artifacts.get({ ...scope, conversationId: null }, item.id), null);
  await artifacts.revoke(scope, item.id);
  await assert.rejects(artifacts.readLink(scope, item.id, token), error => error.status === 404);
  const expiring = await put(); clock.advance(5000); assert.equal(await artifacts.get(scope, expiring.id), null);
  await repo.cancel(scope, job.id); await assert.rejects(put(), conflict); await repo.close();
});

test('jobs facade requires registration, enforces capabilities and atomic quota', async () => {
  const repo = await createMemoryRepository(); const jobs = createJobs({ repository: repo, config: { maxQueued: 1 } });
  const principal = { ...scope, role: 'agent', subjectId: 'builder' };
  await assert.rejects(jobs.claim(principal, { capabilities: ['browser'] }), error => error.status === 403);
  await repo.create(scope, 'agentCapabilities', { ownerId: 'builder', enabled: true, capabilities: ['browser'], runtime: 'codex' });
  await assert.rejects(jobs.claim(principal, { capabilities: ['admin'] }), error => error.status === 403);
  const record = await input(repo); const request = { kind: 'investigation', inputRef: { collection: 'issues', id: record.id }, requiredCapabilities: ['browser'] };
  const results = await Promise.allSettled(['a','b'].map(idempotencyKey => jobs.enqueue(principal, { ...request, idempotencyKey })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 429);
  assert.ok((await jobs.claim(principal, { capabilities: ['browser'] })).lease.token);
  await assert.rejects(jobs.get({ ...principal, role: 'customer' }, { id: 'x' }), error => error.status === 403);
  await repo.close();
});

test('InsForge integration is explicitly opt-in', { skip: process.env.PLATFORM_INSFORGE_TEST !== '1' }, async () => {
  assert.ok(process.env.INSFORGE_URL && process.env.INSFORGE_API_KEY, 'Isolated test backend configuration required');
  const repo = await createInsForgeAdminRepository({ baseUrl: process.env.INSFORGE_URL, apiKey: process.env.INSFORGE_API_KEY });
  const s = { application: `platform-test-${crypto.randomUUID()}`, conversationId: null };
  const record = await input(repo, s);
  assert.equal((await repo.get(s, 'issues', record.id)).id, record.id);
  await repo.remove(s, 'issues', record.id, { expectedVersion: 1 }); await repo.close();
});

test('trusted publication and private output transitions retain scope, CAS and public protection', async () => {
  const repo = await createMemoryRepository();
  try {
    const entry = await repo.create(scope, 'knowledgeEntries', { visibility: 'private', evidenceStatus: 'unverified' });
    const patch = { visibility: 'published', evidenceStatus: 'verified' };
    await assert.rejects(repo.update(scope, 'knowledgeEntries', entry.id, { expectedVersion: 1, patch }), conflict);
    const published = await repo.transition(scope, 'knowledgeEntries', entry.id, { transition: 'publish', expectedVersion: 1, patch });
    assert.equal(published.visibility, 'published');
    await assert.rejects(repo.transition(scope, 'knowledgeEntries', entry.id, { transition: 'publish', expectedVersion: 1, patch }), conflict);
    await assert.rejects(repo.transition(scope, 'knowledgeEntries', entry.id, { transition: 'publish', expectedVersion: 2, patch: { ...patch, title: 'escape' } }), conflict);
    await assert.rejects(repo.transition({ ...scope, conversationId: 'other' }, 'knowledgeEntries', entry.id, { transition: 'publish', expectedVersion: 2, patch }), { status: 404 });
    const video = await repo.create(scope, 'videoProjects', { visibility: 'private' });
    const reset = { visibility: 'private', publication: null, outputArtifactId: 'out', outputEditHash: 'hash' };
    await assert.rejects(repo.update(scope, 'videoProjects', video.id, { expectedVersion: 1, patch: reset }), conflict);
    assert.equal((await repo.transition(scope, 'videoProjects', video.id, { transition: 'private-output', expectedVersion: 1, patch: reset })).outputArtifactId, 'out');
  } finally { await repo.close(); }
});
