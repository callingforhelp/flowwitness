import { Repository, emptySnapshot } from './repository.mjs';
import { cloneJson, normalizeScope } from './records.mjs';
import { conflict, unavailable } from './errors.mjs';

/** Trusted coordinator adapter. Never expose its admin client to a module/browser.
 * All state transitions use the same engine as local mode. A scope revision CAS
 * retries the entire operation, so stale claims and uploads cannot commit.
 */
export async function createInsForgeRepository({ client, maxRetries = 20 } = {}) {
  if (!client?.database?.rpc) throw unavailable('InsForge SDK client required');
  async function rpc(name, args) {
    const { data, error } = await client.database.rpc(name, args);
    if (error) throw unavailable(`InsForge ${name} failed`);
    return data;
  }
  const store = {
    async open() {}, async close() {},
    async transaction(scope, task) {
      scope = normalizeScope(scope);
      const args = { p_application: scope.application, p_conversation: scope.conversationId };
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const loaded = await rpc('platform_load', args);
        const state = loaded.state ?? emptySnapshot();
        const result = await task(state, Date.parse(loaded.now));
        const committed = await rpc('platform_commit', { ...args, p_version: loaded.version, p_state: state });
        if (committed) return cloneJson(result);
      }
      throw conflict('Concurrent transaction retry limit exceeded');
    },
  };
  return new Repository({ store }).open();
}

/** Optional SDK loading causes no import-time network or configuration reads. */
export async function createInsForgeAdminRepository({ baseUrl, apiKey, ...options }) {
  const { createAdminClient } = await import('@insforge/sdk');
  return createInsForgeRepository({ ...options, client: createAdminClient({ baseUrl, apiKey }) });
}
