import { createGrokBuild } from './grok-build-harness';

/**
 * Default Grok Build harness instance. Equivalent to `createGrokBuild()`.
 */
export const grokBuild = createGrokBuild();

export { createGrokBuild } from './grok-build-harness';
export type {
  GrokBuildAuthenticationMode,
  GrokBuildHarnessSettings,
} from './grok-build-harness';
export { VERSION } from './version';
