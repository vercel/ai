import type {
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { Callback } from '../util/callback';
import type { TypedToolCall } from './tool-call';
import { ToolOutput } from './tool-output';

/**
 * Event passed to the `onToolExecutionStart` callback.
 *
 * Called when a tool execution begins, before the tool's `execute` function is invoked.
 */
export type ToolExecutionStartEvent<TOOLS extends ToolSet = ToolSet> = {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  // readonly tool: TOOLS[keyof TOOLS];

  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
   */
  readonly messages: ModelMessage[];

  /** The full tool call object. */
  readonly toolCall: TypedToolCall<TOOLS>;

  /** User-defined context object flowing through the generation. */
  // TODO: restrict the tool context to only that particular tool, and not the entire tool set
  readonly toolContext: InferToolSetContext<TOOLS>;
};

/**
 * Event passed to the `onToolExecutionEnd` callback.
 *
 * Called when a tool execution completes, either successfully or with an error.
 * Uses a discriminated union on the `success` field.
 */
export type ToolExecutionEndEvent<TOOLS extends ToolSet = ToolSet> = {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  // readonly tool: TOOLS[keyof TOOLS];

  /** The full tool call object. */
  readonly toolCall: TypedToolCall<TOOLS>;

  /** Execution time of the tool call in milliseconds. */
  readonly durationMs: number;

  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
   */
  readonly messages: ModelMessage[];

  /** User-defined context object flowing through the generation. */
  // TODO: restrict the tool context to only that particular tool, and not the entire tool set
  readonly toolContext: InferToolSetContext<TOOLS>;

  readonly toolOutput: ToolOutput<TOOLS>;
};

/**
 * Callback that is set using the `experimental_onToolExecutionStart` option.
 *
 * Called when a tool execution begins, before the tool's `execute` function is invoked.
 * Use this for logging tool invocations, tracking tool usage, or pre-execution validation.
 *
 * @param event - The event object containing tool call information.
 */
export type OnToolExecutionStartCallback<TOOLS extends ToolSet = ToolSet> =
  Callback<ToolExecutionStartEvent<TOOLS>>;

/**
 * Callback that is set using the `experimental_onToolExecutionEnd` option.
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
export type OnToolExecutionEndCallback<TOOLS extends ToolSet = ToolSet> =
  Callback<ToolExecutionEndEvent<TOOLS>>;
