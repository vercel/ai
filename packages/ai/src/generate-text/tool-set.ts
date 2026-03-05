import { Context, Tool } from '@ai-sdk/provider-utils';

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

export type InferContextFromTool<TOOL extends Tool> =
  TOOL extends Tool<any, any, infer CONTEXT> ? CONTEXT : never;

export type InferContextFromToolSet<TOOLS extends ToolSet> =
  TOOLS extends ToolSet ? InferContextFromTool<TOOLS[keyof TOOLS]> : never;
