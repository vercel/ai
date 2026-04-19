import {
  InferToolContext,
  InferToolInput,
  ToolNeedsApprovalFunction,
  ToolSet,
} from '@ai-sdk/provider-utils';

/**
 * Configure whether individual tools require approval before they can run.
 *
 * Each tool can be assigned either a boolean or a function that decides at
 * runtime whether approval is needed.
 */
export type ToolNeedsApprovalConfiguration<TOOLS extends ToolSet> = {
  [key in keyof TOOLS]?:
    | boolean
    | ToolNeedsApprovalFunction<
        InferToolInput<TOOLS[key]>,
        InferToolContext<TOOLS[key]>
      >;
};
