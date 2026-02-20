import { ModelMessage } from '@ai-sdk/provider-utils';
import { TypedToolCall } from '../generate-text/tool-call';
import { ToolSet } from '../generate-text/tool-set';

/**
 * Callback that is set using the `experimental_onToolCallFinish` option on the agent.
 *
 * Called when a tool execution completes, either successfully or with an error.
 * Use this for logging tool results, tracking execution time, or error handling.
 *
 * The event uses a discriminated union on the `success` field:
 * - When `success: true`: `output` contains the tool result, `error` is never present.
 * - When `success: false`: `error` contains the error, `output` is never present.
 *
 * @param event - The event object containing tool call result information.
 */
export type ToolLoopAgentOnToolCallFinishCallback<
  TOOLS extends ToolSet = ToolSet,
> = (
  event: {
    /** Zero-based index of the current step where this tool call occurred. May be undefined in streaming contexts. */
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
    /** Execution time of the tool call in milliseconds. */
    readonly durationMs: number;
    /** Identifier from telemetry settings for grouping related operations. */
    readonly functionId: string | undefined;
    /** Additional metadata from telemetry settings. */
    readonly metadata: Record<string, unknown> | undefined;
    /** User-defined context object flowing through the generation. */
    readonly experimental_context: unknown;
  } & (
    | {
        /** Indicates the tool call succeeded. */
        readonly success: true;
        /** The tool's return value. */
        readonly output: unknown;
        readonly error?: never;
      }
    | {
        /** Indicates the tool call failed. */
        readonly success: false;
        readonly output?: never;
        /** The error that occurred during tool execution. */
        readonly error: unknown;
      }
  ),
) => PromiseLike<void> | void;
