import { createCursor } from './cursor-harness';

/**
 * Default Cursor harness instance. Equivalent to `createCursor()`.
 */
export const cursor = createCursor();

export { createCursor } from './cursor-harness';
export type { CursorHarnessSettings } from './cursor-harness';
export { VERSION } from './version';
