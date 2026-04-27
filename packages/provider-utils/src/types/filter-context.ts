import type { Context } from './context';

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

/**
 * Filters sensitive top-level properties out of a context object.
 */
export function filterContext<
  CONTEXT extends Context,
  SENSITIVE_CONTEXT extends SensitiveContext<CONTEXT>,
>({
  context,
  sensitiveContext,
}: {
  context: CONTEXT;
  sensitiveContext: SENSITIVE_CONTEXT;
}): RestrictedContext<CONTEXT, SENSITIVE_CONTEXT> {
  if (sensitiveContext == null) {
    return context as RestrictedContext<CONTEXT, SENSITIVE_CONTEXT>;
  }

  return Object.fromEntries(
    Object.entries(context).filter(
      ([key]) => sensitiveContext[key as keyof CONTEXT] !== true,
    ),
  ) as RestrictedContext<CONTEXT, SENSITIVE_CONTEXT>;
}
