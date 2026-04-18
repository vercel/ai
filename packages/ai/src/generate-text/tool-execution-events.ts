import type {
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { Callback } from '../util/callback';
import type { TypedToolCall } from './tool-call';

/**
 * Event passed to the `onToolExecutionStart` callback.
 *
 * Called when a tool execution begins, before the tool's `execute` function is invoked.
 */
export interface ToolExecutionStartEvent<TOOLS extends ToolSet = ToolSet> {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Zero-based index of the current step where this tool call occurs. */
  readonly stepNumber: number | undefined;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string | undefined;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string | undefined;

  /** The full tool call object. */
  readonly toolCall: TypedToolCall<TOOLS>;

  /** The conversation messages available at tool execution time. */
  readonly messages: Array<ModelMessage>;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** User-defined context object flowing through the generation. */
  readonly context: InferToolSetContext<TOOLS>;
}

/**
 * Event passed to the `onToolExecutionEnd` callback.
 *
 * Called when a tool execution completes, either successfully or with an error.
 * Uses a discriminated union on the `success` field.
 */
export type ToolExecutionEndEvent<TOOLS extends ToolSet = ToolSet> = {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Zero-based index of the current step where this tool call occurred. */
  readonly stepNumber: number | undefined;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string | undefined;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string | undefined;

  /** The full tool call object. */
  readonly toolCall: TypedToolCall<TOOLS>;

  /** The conversation messages available at tool execution time. */
  readonly messages: Array<ModelMessage>;

  /** Execution time of the tool call in milliseconds. */
  readonly durationMs: number;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** User-defined context object flowing through the generation. */
  readonly context: InferToolSetContext<TOOLS>;
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
);

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
