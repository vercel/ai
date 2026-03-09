import { Context, InferToolContext, Tool } from '@ai-sdk/provider-utils';
import { UnionToIntersection } from '../util/union-to-intersection';

export type ToolSet = Record<
  string,
  (
    | Tool<never, never, Context>
    | Tool<any, any, Context>
    | Tool<any, never, Context>
    | Tool<never, any, Context>
  ) &
    Pick<
      Tool<any, any, Context>,
      | 'execute'
      | 'onInputAvailable'
      | 'onInputStart'
      | 'onInputDelta'
      | 'needsApproval'
    >
>;

export type InferToolSetContext<TOOLS extends ToolSet> = UnionToIntersection<
  {
    [K in keyof TOOLS]: InferToolContext<TOOLS[K]>;
  }[keyof TOOLS]
>;

export type ExpandedContext<TOOLS extends ToolSet> =
  InferToolSetContext<TOOLS> & Context;
