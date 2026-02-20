import { ModelMessage } from '@ai-sdk/provider-utils';
import { TypedToolCall } from '../generate-text/tool-call';
import { ToolSet } from '../generate-text/tool-set';

/**
 * Callback that is set using the `experimental_onToolCallStart` option on the agent.
 *
 * Called when a tool execution begins, before the tool's `execute` function is invoked.
 * Use this for logging tool invocations, tracking tool usage, or pre-execution validation.
 *
 * @param event - The event object containing tool call information.
 */
export type ToolLoopAgentOnToolCallStartCallback<
  TOOLS extends ToolSet = ToolSet,
> = (event: {
  /** Zero-based index of the current step where this tool call occurs. May be undefined in streaming contexts. */
  readonly stepNumber: number | undefined;
  /** Information about the model being used. May be undefined in streaming contexts. */
  readonly model:
    | {
        /** The provider of the model. */
        readonly provider: string;
        /** The ID of the model. */
        readonly modelId: string;
      }
    | undefined;
  /** The full tool call object. */
  readonly toolCall: TypedToolCall<TOOLS>;
  /** The conversation messages available at tool execution time. */
  readonly messages: Array<ModelMessage>;
  /** Signal for cancelling the operation. */
  readonly abortSignal: AbortSignal | undefined;
  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;
  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;
  /** User-defined context object flowing through the generation. */
  readonly experimental_context: unknown;
}) => PromiseLike<void> | void;
