import { createCline } from './cline-harness';

/**
 * Default `cline` harness instance with no overrides — suitable for the
 * common case where the Cline SDK's defaults are fine. Equivalent to
 * `createCline()`.
 */
export const cline = createCline();

export { createCline } from './cline-harness';
export { VERSION } from './version';
export type { ClineHarnessSettings } from './cline-harness';
export type { ClineAuthenticationMode } from './cline-auth';
