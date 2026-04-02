import type { InferToolContext } from './infer-tool-context';
import type { ToolSet } from './tool-set';
import type { UnionToIntersection } from './union-to-intersection';

/**
 * Infer the context type for a tool set.
 *
 * The inferred type contains all properties required by the contexts of the
 * tools in the set.
 *
 * If there are incompatible properties, they will be of type `never`.
 */
export type InferToolSetContext<TOOLS extends ToolSet> = UnionToIntersection<
  {
    [K in keyof TOOLS]: InferToolContext<NoInfer<TOOLS[K]>>;
  }[keyof TOOLS]
>;
