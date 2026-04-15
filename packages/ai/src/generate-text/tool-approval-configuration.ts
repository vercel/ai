import {
  Context,
  InferToolSetContext,
  ToolNeedsApprovalFunction,
  ToolSet,
} from '@ai-sdk/provider-utils';

/**
 * Configure whether individual tools require approval before they can run.
 *
 * Each tool can be assigned either a boolean or a function that decides at
 * runtime whether approval is needed.
 */
export type ToolApprovalConfiguration<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
> = {
  [key in keyof TOOLS]?:
    | boolean
    | ToolNeedsApprovalFunction<
        NoInfer<TOOLS[key]['inputSchema']>,
        InferToolSetContext<TOOLS> & USER_CONTEXT
      >;
};
