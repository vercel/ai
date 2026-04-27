/**
 * A context object that is passed into tool execution.
 */
export type Context = Record<string, unknown>;

/**
 * Top-level context properties that contain sensitive data.
 */
export type SensitiveContext<CONTEXT extends Context> =
  | { [KEY in keyof CONTEXT]?: boolean }
  | undefined;
