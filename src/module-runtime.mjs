import { createLocalRepository, createInsForgeAdminRepository, createLocalArtifacts, createJobs, principalScope } from './platform/index.mjs';
import { createModule as issues } from './modules/issues/index.mjs';
import { createModule as knowledge } from './modules/knowledge/index.mjs';
import { createModule as agents } from './modules/agents/index.mjs';
import { createModule as reproduction } from './modules/reproduction/index.mjs';
import { createModule as video } from './modules/video/index.mjs';
import { createModule as maintenance } from './modules/maintenance/index.mjs';

export const isModulePath = path => /^\/v1\/(issues|knowledge|agents|investigations|reproductions|videos)(?:\/|$)/.test(path) || /^\/v1\/artifacts\/[^/]+\/content$/.test(path);

export async function createModuleRuntime({ dir, workflow, browser, renderer, config = {}, stateBackend = 'local', moduleStateBackend, insforgeUrl, insforgeApiKey } = {}) {
  const backend = moduleStateBackend || stateBackend || 'local';
  if (!['local', 'insforge'].includes(backend)) throw new Error('Unsupported module state backend');
  if (backend === 'insforge' && (typeof insforgeUrl !== 'string' || !insforgeUrl.trim() || typeof insforgeApiKey !== 'string' || !insforgeApiKey.trim())) {
    throw new Error('InsForge module state requires FLOWWITNESS_INSFORGE_URL and FLOWWITNESS_INSFORGE_API_KEY');
  }
  const repository = backend === 'insforge'
    ? await createInsForgeAdminRepository({ baseUrl: insforgeUrl, apiKey: insforgeApiKey })
    : await createLocalRepository({ dir });
  try {
    const artifacts = createLocalArtifacts({ repository });
    const jobs = createJobs({ repository, config: config.jobs });
    const adapters = { repository, artifacts, jobs };
    const modules = {
      issues: issues({ ...adapters, config: config.issues }),
      knowledge: knowledge({ ...adapters, config: config.knowledge }),
      agents: agents({ ...adapters, config: config.agents }),
      reproduction: reproduction({ ...adapters, browser, config: config.reproduction }),
      video: video({ ...adapters, renderer, config: config.video }),
      maintenance: maintenance({ workflow }),
    };
    return { modules, repository, artifacts, jobs, close: () => repository.close(),
      async handle(ctx) {
        try {
          const match = /^\/v1\/artifacts\/([^/]+)\/content$/.exec(ctx.path);
          if (match) {
            if (ctx.method !== 'GET') return { status: 405, body: { error: { code: 'method_not_allowed', message: 'Method not allowed' }, requestId: ctx.requestId } };
            const scope = principalScope(ctx.principal);
            const stream = await artifacts.readLink(scope, match[1], ctx.query?.token);
            const meta = await artifacts.get(scope, match[1]);
            return { status: 200, stream, mediaType: meta?.mediaType || 'application/octet-stream' };
          }
          for (const module of Object.values(modules)) {
            const response = await module.handle(ctx);
            if (response) return response;
          }
          return null;
        } catch (error) {
          return { status: error.status || 500, body: { error: { code: error.code || 'internal_error', message: error.status ? error.message : 'Request failed' }, requestId: ctx.requestId } };
        }
      },
    };
  } catch (error) { await repository.close(); throw error; }
}
