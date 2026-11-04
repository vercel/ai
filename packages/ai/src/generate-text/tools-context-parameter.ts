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
 * Helper type for request options that include both tools and their context.
 */
export type ToolsContextParameter<TOOLS extends ToolSet> = {
  tools?: TOOLS;
} & ToolsContextSettings<TOOLS>;
