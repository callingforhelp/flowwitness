import { principalScope } from '../../platform/jobs.mjs';
import { unavailable } from '../../platform/errors.mjs';

export function createModule({ workflow } = {}) {
  const call = async (name, principal, ...args) => {
    principalScope(principal, ['operator']);
    if (typeof workflow?.[name] !== 'function') throw unavailable('Workflow adapter unavailable');
    return workflow[name](...args);
  };
  return {
    impact: (principal, input) => call('impact', principal, input),
    verify: (principal, input) => call('verify', principal, input),
    publish: (principal, input) => call('publish', principal, input),
    // Existing HTTP routes retain their legacy response and lifecycle contracts.
    async handle() { return null; },
  };
}
