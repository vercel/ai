import {
  Context,
  InferToolContext,
  InferToolInput,
  MaybePromiseLike,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';

/**
 * The approval status of a tool configuration. This can be one of the following:
 *
 * - 'not-applicable': The tool does not require approval.
 * - 'approved': The tool is automatically approved.
 * - 'denied': The tool is automatically denied.
 * - 'user-approval': The tool requires user approval.
 *
 * In addition to the string statuses, you can also use object statuses with a reason property.
 */
export type ToolApprovalStatus =
  | 'not-applicable'
  | { type: 'not-applicable'; reason?: never }
  | 'approved'
  | { type: 'approved'; reason?: string }
  | 'denied'
  | { type: 'denied'; reason?: string }
  | 'user-approval'
  | { type: 'user-approval'; reason?: never };

/**
 * Function that is called to determine if the tool needs approval before it can be executed.
 */
export type ToolApprovalFunction<
  INPUT,
  TOOL_CONTEXT extends Context | unknown | never,
> = (
  input: INPUT,
  options: {
    /**
     * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
     */
    toolCallId: string;

    /**
     * Tool context as defined by the tool's context schema.
     * The tool context is specific to the tool and is passed to the tool execution.
     *
     * Treat the context object as immutable inside tools.
     * Mutating the context object can lead to race conditions and unexpected results
     * when tools are called in parallel.
     *
     * If you need to mutate the context, analyze the tool calls and results
     * in `prepareStep` and update it there.
     */
    toolContext: TOOL_CONTEXT;

    /**
     * Messages that were sent to the language model to initiate the response that contained the tool call.
     * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
     */
    messages: ModelMessage[];
  },
) => MaybePromiseLike<ToolApprovalStatus>;

/**
 * Configure whether individual tools require approval before they can run.
 *
 * Each tool can be assigned either an approval status or a function that produces one at runtime.
 *
 * The approval status can be one of the following:
 * - 'not-applicable': The tool does not require approval.
 * - 'approved': The tool is automatically approved.
 * - 'denied': The tool is automatically denied.
 * - 'user-approval': The tool requires user approval.
 */
export type ToolApprovalConfiguration<TOOLS extends ToolSet> = {
  [key in keyof TOOLS]?:
    | ToolApprovalStatus
    | ToolApprovalFunction<
        InferToolInput<TOOLS[key]>,
        InferToolContext<TOOLS[key]>
      >;
};
