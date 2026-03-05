import { Context, Tool } from '@ai-sdk/provider-utils';

export type ToolSet<CONTEXT extends Context = any> = Record<
  string,
  (
    | Tool<CONTEXT, never, never>
    | Tool<CONTEXT, any, any>
    | Tool<CONTEXT, any, never>
    | Tool<CONTEXT, never, any>
  ) &
    Pick<
      Tool<CONTEXT, any, any>,
      | 'execute'
      | 'onInputAvailable'
      | 'onInputStart'
      | 'onInputDelta'
      | 'needsApproval'
    >
>;

export type InferContextFromToolSet<TOOLS extends ToolSet> =
  TOOLS extends ToolSet<infer CONTEXT> ? CONTEXT : never;
