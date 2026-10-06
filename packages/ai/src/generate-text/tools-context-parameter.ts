import type {
  HasRequiredKey,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';

/**
 * Checks whether a tool context map contains any contextual tool entries.
 */
type IsEmptyObject<OBJECT> = keyof OBJECT extends never ? true : false;

/**
 * Makes the toolsContext setting optional, required, or unavailable based on
 * the tool set.
 */
export type ToolsContextSettings<TOOLS extends ToolSet> =
  IsEmptyObject<InferToolSetContext<TOOLS>> extends true
    ? { toolsContext?: never }
    : HasRequiredKey<InferToolSetContext<TOOLS>> extends true
      ? { toolsContext: InferToolSetContext<TOOLS> }
      : { toolsContext?: InferToolSetContext<TOOLS> };

/**
 * Checks whether a tool context map contains any contextual tool entries.
 *
 * Uses an assignability check instead of `keyof` so that tool sets which
 * contain error-typed tools (e.g. from unresolved declaration files) do not
 * collapse the surrounding parameter type to `any`.
 */
type IsEmptyToolsContext<CONTEXT> =
  CONTEXT extends Record<PropertyKey, never> ? true : false;

/**
 * Makes the toolsContext setting optional or unavailable based on the tool
 * set. Used where the tools context can also be supplied elsewhere, e.g.
 * on the agent constructor or per agent call, where the call-level value
 * overrides the constructor-level value.
 */
export type OptionalToolsContextSettings<TOOLS extends ToolSet> =
  IsEmptyToolsContext<InferToolSetContext<TOOLS>> extends true
    ? { toolsContext?: never }
    : { toolsContext?: InferToolSetContext<TOOLS> };

/**
 * Helper type for request options that include both tools and their context.
 */
export type ToolsContextParameter<TOOLS extends ToolSet> = {
  tools?: TOOLS;
} & ToolsContextSettings<TOOLS>;
