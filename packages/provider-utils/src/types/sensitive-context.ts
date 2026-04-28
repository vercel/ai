import type { Context } from './context';

/**
 * Top-level context properties that contain sensitive data and should be
 * excluded from telemetry.
 */
export type SensitiveContext<CONTEXT extends Context | unknown | never> =
  | { [KEY in keyof CONTEXT]?: boolean }
  | undefined;
