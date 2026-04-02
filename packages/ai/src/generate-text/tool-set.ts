import type { Tool } from '@ai-sdk/provider-utils';

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
