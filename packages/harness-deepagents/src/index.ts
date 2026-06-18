import { createDeepAgents } from './deepagents-harness';

/**
 * Default `deepagents` harness instance with no overrides — suitable for the
 * common case where the runtime's defaults are fine. Equivalent to
 * `createDeepAgents()`.
 */
export const deepAgents = createDeepAgents();

export { createDeepAgents } from './deepagents-harness';
export type { DeepAgentsHarnessSettings } from './deepagents-harness';
export type { DeepAgentsAuthOptions } from './deepagents-auth';
