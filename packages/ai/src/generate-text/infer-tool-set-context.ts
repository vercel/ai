import { InferToolContext } from '@ai-sdk/provider-utils';
import { UnionToIntersection } from '../util/union-to-intersection';
import type { ToolSet } from './tool-set';

/**
 * Infer the context type of a tool set.
 */
export type InferToolSetContext<TOOLS extends ToolSet> = UnionToIntersection<
  {
    [K in keyof TOOLS]: InferToolContext<NoInfer<TOOLS[K]>>;
  }[keyof TOOLS]
>;
