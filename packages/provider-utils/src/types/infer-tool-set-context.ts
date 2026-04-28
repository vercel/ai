import type { InferToolContext } from './infer-tool-context';
import type { ToolSet } from './tool-set';

/**
 * Infer the context type for a tool set.
 *
 * The inferred type maps each tool name to its required context type.
 *
 * Tools without required context properties are omitted from the result.
 */
export type InferToolSetContext<TOOLS extends ToolSet> = {
  [K in keyof TOOLS as InferToolContext<NoInfer<TOOLS[K]>> extends never
    ? never
    : K]: InferToolContext<NoInfer<TOOLS[K]>>;
};
