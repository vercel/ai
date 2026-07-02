import { createCursor } from './cursor-harness';

/**
 * Default `cursor` harness instance with no overrides.
 * Equivalent to `createCursor()`.
 */
export const cursor = createCursor();

export { createCursor } from './cursor-harness';
export type { CursorHarnessSettings } from './cursor-harness';
export type { CursorAuthOptions } from './cursor-auth';
