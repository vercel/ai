import { Context, Tool } from '@ai-sdk/provider-utils';

export type ToolSet<CONTEXT extends Context = any> = Record<
  string,
  (
    | Tool<never, never, CONTEXT>
    | Tool<any, any, CONTEXT>
    | Tool<any, never, CONTEXT>
    | Tool<never, any, CONTEXT>
  ) &
    Pick<
      Tool<any, any, CONTEXT>,
      | 'execute'
      | 'onInputAvailable'
      | 'onInputStart'
      | 'onInputDelta'
      | 'needsApproval'
    >
>;

export type InferContextFromToolSet<TOOLS extends ToolSet> =
  TOOLS extends ToolSet<infer CONTEXT> ? CONTEXT : never;
