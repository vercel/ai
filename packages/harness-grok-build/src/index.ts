import { createGrokBuild } from './grok-build-harness';

/**
 * Default `grok-build` harness instance with no overrides — suitable for the
 * common case where the underlying `grok` CLI's defaults are fine.
 * Equivalent to `createGrokBuild()`.
 */
export const grokBuild = createGrokBuild();

export { createGrokBuild } from './grok-build-harness';
export type { GrokBuildHarnessSettings } from './grok-build-harness';
export type { GrokBuildAuthOptions } from './grok-build-auth';
