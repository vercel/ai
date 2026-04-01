import { Context, Tool } from '@ai-sdk/provider-utils';
import type { InferToolSetContext } from './infer-tool-set-context';

export type ToolSet = Record<
  string,
  (
    | Tool<never, never, any>
    | Tool<any, any, any>
    | Tool<any, never, any>
    | Tool<never, any, any>
  ) &
    Pick<
      Tool<any, any, any>,
      | 'execute'
      | 'onInputAvailable'
      | 'onInputStart'
      | 'onInputDelta'
      | 'needsApproval'
    >
>;

export type ExpandedContext<TOOLS extends ToolSet> = InferToolSetContext<
  NoInfer<TOOLS>
> &
  Context;
