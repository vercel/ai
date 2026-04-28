import type { Context } from '@ai-sdk/provider-utils';

/**
 * Top-level context properties that contain sensitive data.
 */
export type SensitiveContext<CONTEXT extends Context> =
  | { [KEY in keyof CONTEXT]?: boolean }
  | undefined;
