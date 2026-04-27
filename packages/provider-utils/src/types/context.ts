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

type SensitiveContextKeys<
  CONTEXT extends Context,
  SENSITIVE_CONTEXT extends SensitiveContext<CONTEXT>,
> = SENSITIVE_CONTEXT extends undefined
  ? never
  : {
      [KEY in keyof CONTEXT]: NonNullable<SENSITIVE_CONTEXT> extends {
        [K in KEY]?: infer VALUE;
      }
        ? VALUE extends true
          ? KEY
          : never
        : never;
    }[keyof CONTEXT];

/**
 * A context object with sensitive top-level properties removed.
 */
export type RestrictedContext<
  CONTEXT extends Context,
  SENSITIVE_CONTEXT extends SensitiveContext<CONTEXT>,
> = Omit<CONTEXT, SensitiveContextKeys<CONTEXT, SENSITIVE_CONTEXT>>;
