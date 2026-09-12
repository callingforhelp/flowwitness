import { randomUUID } from 'node:crypto';
import { DurableJsonStore } from './durable-store.mjs';
import { MemoryJsonStore } from './memory-store.mjs';
import { systemClock } from './clock.mjs';
import { buildJobRecord } from './job-model.mjs';
import * as R from './records.mjs';
import { invalid, conflict, notFound } from './errors.mjs';

export const emptySnapshot = () => ({ records: [], artifacts: [], links: [] });
const terminal = job => R.TERMINAL_JOB_STATUSES.includes(job.status);
export function requireLiveLease(job, { ownerId, token }, now) {
  if (!job) throw notFound();
  if (job.status !== 'leased' || job.cancelRequestedAt || !job.lease ||
      job.lease.token !== token || (ownerId !== undefined && job.lease.ownerId !== ownerId) ||
      Date.parse(job.lease.expiresAt) <= now || Date.parse(job.deadlineAt) <= now) throw conflict('Lease is no longer current');
  return job;
}

export class Repository {
  constructor({ store, clock = systemClock }) { this.store = store; this.clock = clock; }
  async open() { await this.store.open(); return this; }
  async close() { await this.store.close(); }
  async transaction(scope, task) {
    scope = R.normalizeScope(scope);
    if (this.store.transaction) return this.store.transaction(scope, task);
    return this.store.mutex.run(async () => {
      const state = await this.store.read();
      const result = await task(state, this.clock.now());
      await this.store.write(state);
      return R.cloneJson(result);
    });
  }
  rows(state, scope, collection) {
    R.assertCollection(collection);
    return state.records.filter(row => row.collection === collection && R.sameScope(row.record, scope));
  }
  find(state, scope, collection, id) { return this.rows(state, scope, collection).find(row => row.record.id === id)?.record ?? null; }
  stamp(scope, input, now) {
    const time = R.toIso(now);
    return { ...input, ...R.normalizeScope(scope), schemaVersion: 1, id: input.id ?? randomUUID(), version: 1, createdAt: time, updatedAt: time };
  }
  bump(record, now) { record.version++; record.updatedAt = R.toIso(now); return record; }
  async create(scope, collection, input) {
    R.assertCollection(collection);
    const clean = R.assertRecordInput(input, { allowId: true });
    if (clean.id !== undefined) R.assertShortString(clean.id, 'id');
    if (collection === R.JOB_COLLECTION) throw conflict('Use enqueue for jobs');
    if ((collection === 'evidenceBundles' && clean.status !== undefined && clean.status !== 'unverified') ||
        (['knowledgeEntries', 'videoProjects'].includes(collection) && clean.visibility !== undefined && clean.visibility !== 'private') ||
        (collection === 'knowledgeEntries' && clean.evidenceStatus !== undefined && clean.evidenceStatus !== 'unverified')) throw conflict('Trusted transition required');
    return this.transaction(scope, (state, now) => {
      const record = this.stamp(scope, clean, now);
      if (this.find(state, scope, collection, record.id)) throw conflict('Duplicate ID');
      state.records.push({ collection, record }); return record;
    });
  }
  async get(scope, collection, id) { return this.transaction(scope, state => this.find(state, scope, collection, id)); }
  async query(scope, collection, { where = {}, text = '', limit = 50, cursor = null } = {}) {
    R.assertCollection(collection);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof text !== 'string' || !where || Array.isArray(where) || typeof where !== 'object') throw invalid('Invalid query');
    for (const [field, value] of Object.entries(where)) {
      if (!R.queryFields(collection).has(field) || (value !== null && !['string', 'number', 'boolean'].includes(typeof value))) throw invalid('Invalid query filter');
    }
    text = text.trim().toLowerCase();
    const hash = R.queryFingerprint(collection, where, text);
    const after = cursor === null ? null : R.decodeCursor(cursor);
    if (after && (after.scopeKey !== R.scopeKey(scope) || after.collection !== collection || after.queryHash !== hash)) throw invalid('Cursor does not match query');
    return this.transaction(scope, state => {
      const rows = this.rows(state, scope, collection).map(row => row.record).filter(record =>
        Object.entries(where).every(([key, value]) => record[key] === value) &&
        (!text || R.TEXT_FIELDS.some(field => typeof record[field] === 'string' && record[field].toLowerCase().includes(text))) &&
        (!after || R.compareRecords(record, after) > 0)).sort(R.compareRecords);
      const items = rows.slice(0, limit), last = items.at(-1);
      return { items, nextCursor: rows.length > limit ? R.encodeCursor({ scope, collection, queryHash: hash, createdAt: last.createdAt, id: last.id }) : null };
    });
  }
  async update(scope, collection, id, { expectedVersion, patch }) {
    const clean = R.assertRecordInput(patch);
    if (Object.keys(clean).some(field => R.protectedFields(collection).includes(field))) throw conflict('Protected transition');
    return this.transaction(scope, (state, now) => {
      const record = this.find(state, scope, collection, id);
      this.cas(record, expectedVersion); Object.assign(record, clean); return this.bump(record, now);
    });
  }
  // Coordinator-only operations: callers must authorize and validate evidence first.
  // Named transitions deliberately do not expose arbitrary protected-field writes.
  async transition(scope, collection, id, { expectedVersion, transition, patch }) {
    const clean = R.assertRecordInput(patch);
    const allowed = {
      'knowledgeEntries:publish': ['visibility', 'evidenceStatus', 'publishedBy', 'publishedAt'],
      'videoProjects:publish': ['visibility', 'publication'],
      'videoProjects:private-output': ['visibility', 'publication', 'outputArtifactId', 'outputEditHash', 'renderedAt', 'locale', 'edit'],
    }[`${collection}:${transition}`];
    if (!allowed || Object.keys(clean).some(field => !allowed.includes(field))) throw conflict('Invalid trusted transition');
    if (transition === 'publish' && (clean.visibility !== 'published' ||
        (collection === 'knowledgeEntries' && clean.evidenceStatus !== 'verified'))) throw conflict('Invalid publication');
    if (transition === 'private-output' && (clean.visibility !== 'private' || clean.publication !== null)) throw conflict('Output must be private');
    return this.transaction(scope, (state, now) => {
      const record = this.find(state, scope, collection, id);
      this.cas(record, expectedVersion); Object.assign(record, clean); return this.bump(record, now);
    });
  }
  cas(record, version) {
    if (!record) throw notFound();
    if (!Number.isInteger(version) || version < 1) throw invalid('expectedVersion required');
    if (record.version !== version) throw conflict('Stale version');
  }
  async remove(scope, collection, id, { expectedVersion }) {
    if (collection === R.JOB_COLLECTION) throw conflict('Jobs cannot be removed');
    return this.transaction(scope, state => {
      const record = this.find(state, scope, collection, id); this.cas(record, expectedVersion);
      state.records = state.records.filter(row => row.record !== record); return { deleted: true };
    });
  }
  async enqueue(scope, input, { idempotencyKey, maxQueued = Infinity } = {}) {
    return this.transaction(scope, (state, now) => {
      const job = buildJobRecord({ input, idempotencyKey, nowMs: now });
      const existing = this.rows(state, scope, R.JOB_COLLECTION).map(row => row.record).find(record => record.kind === job.kind && record.idempotencyKey === idempotencyKey);
      if (existing) { if (existing.inputHash !== job.inputHash) throw conflict('Idempotency key reused with different input'); return existing; }
      if (!this.find(state, scope, job.inputRef.collection, job.inputRef.id)) throw notFound('Input reference not found');
      if (this.rows(state, scope, R.JOB_COLLECTION).filter(row => !terminal(row.record)).length >= maxQueued) throw Object.assign(new Error('Job quota reached'), { status: 429, code: 'quota' });
      const record = this.stamp(scope, job, now); state.records.push({ collection: R.JOB_COLLECTION, record }); return record;
    });
  }
  async claim(scope, { ownerId, capabilities = [], leaseMs } = {}) {
    R.assertShortString(ownerId, 'ownerId'); capabilities = R.assertStringArray(capabilities, 'capabilities'); leaseMs = R.clampLeaseMs(leaseMs);
    return this.transaction(scope, (state, now) => {
      const jobs = this.rows(state, scope, R.JOB_COLLECTION).map(row => row.record).sort(R.compareRecords);
      for (const job of jobs) {
        if (terminal(job)) continue;
        const expired = !job.lease || Date.parse(job.lease.expiresAt) <= now;
        if (Date.parse(job.deadlineAt) <= now || (expired && job.attempt >= job.maxAttempts)) {
          Object.assign(job, { status: 'failed', lease: null, errorCode: Date.parse(job.deadlineAt) <= now ? 'deadline_exceeded' : 'attempts_exhausted' }); this.bump(job, now);
        }
      }
      const job = jobs.find(job => !terminal(job) && (job.status === 'queued' || Date.parse(job.lease.expiresAt) <= now) && job.requiredCapabilities.every(cap => capabilities.includes(cap)));
      if (!job) return null;
      job.status = 'leased'; job.attempt++; job.lease = { ownerId, token: randomUUID(), expiresAt: R.toIso(Math.min(now + leaseMs, Date.parse(job.deadlineAt))) };
      return this.bump(job, now);
    });
  }
  async renew(scope, id, options) {
    return this.transaction(scope, (state, now) => {
      const job = requireLiveLease(this.find(state, scope, R.JOB_COLLECTION, id), options, now);
      job.lease.expiresAt = R.toIso(Math.min(now + R.clampLeaseMs(options.leaseMs), Date.parse(job.deadlineAt))); return this.bump(job, now);
    });
  }
  async settle(scope, id, options) {
    if (!['succeeded', 'failed'].includes(options.status)) throw invalid('Invalid terminal status');
    return this.transaction(scope, (state, now) => {
      const job = requireLiveLease(this.find(state, scope, R.JOB_COLLECTION, id), options, now);
      let resultRef = null;
      if (options.status === 'succeeded') {
        resultRef = R.assertReference(options.resultRef, 'resultRef');
        if (!this.find(state, scope, resultRef.collection, resultRef.id)) throw notFound('Result reference not found');
      }
      Object.assign(job, { status: options.status, lease: null, resultRef, errorCode: options.status === 'failed' ? R.assertShortString(options.errorCode, 'errorCode') : null });
      return this.bump(job, now);
    });
  }
  async cancel(scope, id) {
    return this.transaction(scope, (state, now) => {
      const job = this.find(state, scope, R.JOB_COLLECTION, id); if (!job) throw notFound();
      if (!terminal(job)) { Object.assign(job, { status: 'cancelled', cancelRequestedAt: R.toIso(now), lease: null }); this.bump(job, now); }
      return job;
    });
  }
}
export async function createLocalRepository({ dir, clock = systemClock } = {}) {
  return new Repository({ store: new DurableJsonStore({ dir, emptySnapshot }), clock }).open();
}
export async function createMemoryRepository({ clock = systemClock } = {}) {
  return new Repository({ store: new MemoryJsonStore({ emptySnapshot }), clock }).open();
}
