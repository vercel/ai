import type {
  InferToolContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { Callback } from '../util/callback';
import type { DynamicToolCall, StaticToolCall } from './tool-call';
import { ToolOutput } from './tool-output';
import type { ValueOf } from '../util/value-of';

/**
 * Resolves a single tool's context type, falling back to `undefined` when the
 * tool does not declare a `contextSchema`.
 */
type ToolContextFor<TOOL extends ToolSet[keyof ToolSet]> = [
  InferToolContext<TOOL>,
] extends [never]
  ? undefined
  : InferToolContext<TOOL>;

type BaseToolExecutionStartFields = {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
   */
  readonly messages: ModelMessage[];
};

type StaticToolExecutionStartEvent<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: BaseToolExecutionStartFields & {
    readonly toolCall: Extract<StaticToolCall<TOOLS>, { toolName: NAME }>;
    readonly toolContext: ToolContextFor<TOOLS[NAME]>;
  };
}>;

type DynamicToolExecutionStartEvent = BaseToolExecutionStartFields & {
  readonly toolCall: DynamicToolCall;
  readonly toolContext: unknown;
};

type WidenedToolExecutionStartEvent = BaseToolExecutionStartFields & {
  readonly toolCall: StaticToolCall<ToolSet> | DynamicToolCall;
  readonly toolContext: unknown;
};

/**
 * Event passed to the `onToolExecutionStart` callback.
 *
 * Called when a tool execution begins, before the tool's `execute` function is invoked.
 */
export type ToolExecutionStartEvent<TOOLS extends ToolSet = ToolSet> = [
  ToolSet,
] extends [TOOLS]
  ? WidenedToolExecutionStartEvent
  : StaticToolExecutionStartEvent<TOOLS> | DynamicToolExecutionStartEvent;

type BaseToolExecutionEndFields = {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Execution time of the tool call in milliseconds. */
  readonly durationMs: number;

  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
   */
  readonly messages: ModelMessage[];
};

type StaticToolExecutionEndEvent<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: BaseToolExecutionEndFields & {
    readonly toolCall: Extract<StaticToolCall<TOOLS>, { toolName: NAME }>;
    readonly toolContext: ToolContextFor<TOOLS[NAME]>;
    readonly toolOutput: ToolOutput<TOOLS>;
  };
}>;

type DynamicToolExecutionEndEvent<TOOLS extends ToolSet> =
  BaseToolExecutionEndFields & {
    readonly toolCall: DynamicToolCall;
    readonly toolContext: unknown;
    readonly toolOutput: ToolOutput<TOOLS>;
  };

type WidenedToolExecutionEndEvent = BaseToolExecutionEndFields & {
  readonly toolCall: StaticToolCall<ToolSet> | DynamicToolCall;
  readonly toolContext: unknown;
  readonly toolOutput: ToolOutput<ToolSet>;
};

/**
 * Event passed to the `onToolExecutionEnd` callback.
 *
 * Called when a tool execution completes, either successfully or with an error.
 * Uses the `toolOutput.type` discriminator to distinguish success and error.
 */
export type ToolExecutionEndEvent<TOOLS extends ToolSet = ToolSet> = [
  ToolSet,
] extends [TOOLS]
  ? WidenedToolExecutionEndEvent
  : StaticToolExecutionEndEvent<TOOLS> | DynamicToolExecutionEndEvent<TOOLS>;

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
 * The event uses a discriminated union on `toolOutput.type`:
 * - When `toolOutput.type === 'tool-result'`: `toolOutput.output` contains the tool result.
 * - When `toolOutput.type === 'tool-error'`: `toolOutput.error` contains the error.
 *
 * @param event - The event object containing tool call result information.
 */
export type OnToolExecutionEndCallback<TOOLS extends ToolSet = ToolSet> =
  Callback<ToolExecutionEndEvent<TOOLS>>;
