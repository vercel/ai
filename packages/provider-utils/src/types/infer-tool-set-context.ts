import type { InferToolContext } from './infer-tool-context';
import type { ToolSet } from './tool-set';

/**
 * Infer the context type for a tool set.
 *
 * The inferred type is a union of the required context types of the tools in
 * the set.
 *
 * Tools without required context properties are excluded from the union.
 */
export type InferToolSetContext<TOOLS extends ToolSet> = {
  [K in keyof TOOLS]: InferToolContext<NoInfer<TOOLS[K]>>;
}[keyof TOOLS];
