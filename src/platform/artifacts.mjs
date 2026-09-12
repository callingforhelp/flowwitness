import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { requireLiveLease } from './repository.mjs';
import * as R from './records.mjs';
import { invalid, notFound } from './errors.mjs';

const metadata = item => Object.fromEntries(['id', 'kind', 'mediaType', 'sha256', 'size', 'expiresAt', 'revokedAt'].map(key => [key, item[key]]));
// Bytes and link tokens remain inside the private adapter snapshot, never records.
export function createLocalArtifacts({ repository, ttlMs = R.DEFAULT_ARTIFACT_TTL_MS, maxBytes = 20 * 1024 * 1024 } = {}) {
  if (!(ttlMs > 0 && ttlMs <= R.DEFAULT_ARTIFACT_TTL_MS)) throw invalid('Artifact TTL must be at most 24 hours');
  const find = (state, scope, id) => state.artifacts.find(item => item.id === id && R.sameScope(item, scope));
  const active = (item, now) => item && !item.revokedAt && Date.parse(item.expiresAt) > now;
  return {
    async put(scope, { jobId, leaseToken, kind, mediaType, bytes }) {
      if (!(bytes instanceof Uint8Array)) throw invalid('bytes must be a Uint8Array');
      if (bytes.byteLength > maxBytes) throw invalid('Artifact exceeds size limit');
      R.assertShortString(kind, 'kind'); R.assertShortString(mediaType, 'mediaType');
      const buffer = Buffer.from(bytes);
      return repository.transaction(scope, (state, now) => {
        requireLiveLease(repository.find(state, scope, R.JOB_COLLECTION, jobId), { token: leaseToken }, now);
        const item = { ...R.normalizeScope(scope), id: randomUUID(), jobId, kind, mediaType,
          sha256: createHash('sha256').update(buffer).digest('hex'), size: buffer.length,
          expiresAt: R.toIso(now + ttlMs), revokedAt: null, data: buffer.toString('base64') };
        state.artifacts.push(item); return metadata(item);
      });
    },
    async get(scope, id) {
      return repository.transaction(scope, (state, now) => { const item = find(state, scope, id); return active(item, now) ? metadata(item) : null; });
    },
    async read(scope, id) {
      const data = await repository.transaction(scope, (state, now) => { const item = find(state, scope, id); if (!active(item, now)) throw notFound(); return item.data; });
      return Readable.from([Buffer.from(data, 'base64')]);
    },
    async link(scope, id, { expiresInMs = R.DEFAULT_LINK_TTL_MS } = {}) {
      if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) throw invalid('Invalid link TTL');
      return repository.transaction(scope, (state, now) => {
        const item = find(state, scope, id); if (!active(item, now)) throw notFound();
        const token = randomUUID(); const expiresAt = R.toIso(Math.min(now + expiresInMs, Date.parse(item.expiresAt)));
        state.links.push({ ...R.normalizeScope(scope), token, artifactId: id, expiresAt });
        return { url: `/v1/artifacts/${id}/content?token=${token}`, expiresAt };
      });
    },
    // The coordinator must authenticate and invoke this on EVERY delivery.
    async readLink(scope, id, token) {
      const data = await repository.transaction(scope, (state, now) => {
        const link = state.links.find(item => item.token === token && item.artifactId === id && R.sameScope(item, scope));
        const item = find(state, scope, id);
        if (!link || Date.parse(link.expiresAt) <= now || !active(item, now)) throw notFound();
        return item.data;
      });
      return Readable.from([Buffer.from(data, 'base64')]);
    },
    async revoke(scope, id) {
      return repository.transaction(scope, (state, now) => { const item = find(state, scope, id); if (!item) throw notFound(); item.revokedAt ??= R.toIso(now); item.data = ''; state.links = state.links.filter(link => link.artifactId !== id || !R.sameScope(link, scope)); return { revoked: true }; });
    },
  };
}
