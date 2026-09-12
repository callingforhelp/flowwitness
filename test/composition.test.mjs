import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.mjs';

const adminToken = 'admin-token-abcdefghijklmnopqrstuvwxyz';
const supportToken = 'support-token-abcdefghijklmnopqrstuvwxyz';
test('native server composes scoped modules and preserves private state', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'composition-'));
  const app = await startServer({ root, port: 0, adminToken, supportToken,
    modulePrincipals: { admin: { conversationId: 'one' }, support: { conversationId: 'one', subjectId: 'customer-one' } } });
  t.after(async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); });
  const request = async (route, method = 'GET', body, token = adminToken) => {
    const response = await fetch(app.config.origin + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal(Object.keys(app.moduleRuntime.modules).length, 6);
  const created = await request('/v1/issues', 'POST', { title: 'Login', description: 'Cannot log in', locale: 'en' }, supportToken);
  assert.equal(created.status, 201);
  const id = created.body.item.id;
  assert.equal(created.body.item.createdBy, 'customer-one');
  assert.equal((await request(`/v1/issues/${id}/messages`, 'POST', { text: 'Investigating', locale: 'en' })).status, 201);
  assert.equal((await request(`/v1/issues/${id}`, 'GET', undefined, supportToken)).body.item.messages.length, 1);
  assert.equal((await request('/v1/issues?limit=1')).body.items.length, 1);
  const entry = await app.moduleRuntime.repository.create({ application: app.config.application, conversationId: 'one' }, 'knowledgeEntries', { kind: 'resolution', issueId: id });
  assert.equal((await request(`/v1/issues/${id}/resolve`, 'POST', { expectedVersion: 1, resolutionEntryId: entry.id }, supportToken)).status, 403);
  assert.equal((await request(`/v1/issues/${id}/resolve`, 'POST', { expectedVersion: 1, resolutionEntryId: entry.id })).body.item.status, 'resolved');
  assert.equal((await request('/v1/knowledge?limit=1')).status, 200);
  assert.equal((await request('/v1/agents', 'POST', { ownerId: 'worker', runtime: 'codex', capabilities: ['browser'] })).status, 201);
  assert.equal((await request('/v1/issues', 'DELETE')).status, 405);
  const missing = await request('/v1/issues/no/such/path');
  assert.equal(missing.status, 404); assert.ok(missing.body.requestId);
  assert.equal((await request('/v1/issues', 'GET', undefined, 'bad-token')).status, 401);
  const other = { application: app.config.application, conversationId: 'two', role: 'customer', subjectId: 'other' };
  await assert.rejects(() => app.moduleRuntime.modules.issues.get(other, { id }), e => e.status === 404);
  assert.equal(app.store.data.issues, undefined);
  assert.equal(app.moduleRuntime.repository.store.dir, path.join(app.store.private, 'modules'));
  const scope = { application: app.config.application, conversationId: 'one' };
  const job = await app.moduleRuntime.repository.enqueue(scope, { kind: 'investigation', inputRef: { collection: 'issues', id }, requiredCapabilities: [] }, { idempotencyKey: 'artifact' });
  const lease = await app.moduleRuntime.repository.claim(scope, { ownerId: 'worker', capabilities: [] });
  const artifact = await app.moduleRuntime.artifacts.put(scope, { jobId: job.id, leaseToken: lease.lease.token, kind: 'test', mediaType: 'text/plain', bytes: Buffer.from('private') });
  const link = await app.moduleRuntime.artifacts.link(scope, artifact.id);
  const delivery = await fetch(app.config.origin + link.url, { headers: { authorization: `Bearer ${supportToken}` } });
  assert.equal(delivery.status, 200); assert.equal(await delivery.text(), 'private');
  assert.equal((await fetch(app.config.origin + link.url)).status, 401);
  assert.equal((await request(`/v1/artifacts/${artifact.id}/content?token=wrong`)).status, 404);
});

test('support module requests require a configured binding; legacy query remains available', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'composition-'));
  const app = await startServer({ root, port: 0, adminToken, supportToken });
  t.after(async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); });
  const response = await fetch(app.config.origin + '/v1/issues', { headers: { authorization: `Bearer ${supportToken}`, 'x-conversation-id': 'forged' } });
  assert.equal(response.status, 403);
});
