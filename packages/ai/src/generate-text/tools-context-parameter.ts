import type {
  HasRequiredKey,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';

/**
 * Helper type to make the toolsContext parameter optional or required based on the tool set.
 */
export type ToolsContextParameter<TOOLS extends ToolSet> = {
  tools?: TOOLS;
} & (HasRequiredKey<InferToolSetContext<TOOLS>> extends true
  ? { toolsContext: InferToolSetContext<TOOLS> }
  : { toolsContext?: never });
