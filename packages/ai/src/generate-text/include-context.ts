import type { Context } from '@ai-sdk/provider-utils';

/**
 * Top-level context properties that should be included in telemetry.
 */
export type IncludeContext<CONTEXT extends Context | unknown | never> =
  | { [KEY in keyof CONTEXT]?: boolean }
  | undefined;
