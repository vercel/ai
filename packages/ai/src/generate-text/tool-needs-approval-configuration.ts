import {
  Context,
  InferToolInput,
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
export type ToolNeedsApprovalConfiguration<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
> = {
  [key in keyof TOOLS]?:
    | boolean
    | ToolNeedsApprovalFunction<
        InferToolInput<TOOLS[key]>,
        InferToolSetContext<TOOLS> & USER_CONTEXT
      >;
};
