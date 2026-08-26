import type { JSONValue } from '@ai-sdk/provider';
import type { Context } from './context';
import type { ModelMessage } from './model-message';

/**
 * Per-call decision returned by a `needsApproval` function.
 *
 * Use the object form to attach computed consequence context to the
 * `approval-requested` UI part (bound to that approval id and tool call).
 */
export type ToolNeedsApprovalDecision =
  | boolean
  | {
      /**
       * Whether the tool call requires explicit user approval.
       */
      approvalRequired: boolean;

      /**
       * Dynamic, per-call context for the approval card (blast radius,
       * consequence summary, etc.). Surfaced on the `approval-requested` part.
       *
       * Only used when `approvalRequired` is `true`.
       */
      context?: JSONValue;
    };

/**
 * Function that is called to determine if the tool needs approval before it can be executed.
 *
 * @deprecated Tool approval is handled on a `generateText` / `streamText` level now.
 */
export type ToolNeedsApprovalFunction<
  INPUT,
  CONTEXT extends Context | unknown | never,
> = (
  input: INPUT,
  options: {
    /**
     * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
     */
    toolCallId: string;

    /**
     * Messages that were sent to the language model to initiate the response that contained the tool call.
     * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
     */
    messages: ModelMessage[];

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
    context: CONTEXT;
  },
) => ToolNeedsApprovalDecision | PromiseLike<ToolNeedsApprovalDecision>;
