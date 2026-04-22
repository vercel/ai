import type { ToolSet } from '@ai-sdk/provider-utils';
import type { Callback } from '../util/callback';
import type { LanguageModelUsage } from '../types/usage';
import type { GeneratedFile } from './generated-file';
import type { StepResult } from './step-result';
import type { TypedToolCall } from './tool-call';
import type { StandardizedPrompt } from '../prompt/standardize-prompt';

/**
 * Common model information used across callback events.
 */
export type CallbackModelInfo = {
  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;
  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;
};

/**
 * Event passed to the `onLanguageModelCallStart` callback.
 *
 * Called immediately before the provider model call begins.
 * Unlike `onStepStart`, this only represents model invocation work.
 */
export type LanguageModelCallStartEvent = CallbackModelInfo & {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Prepared tool definitions for the model call, if any. */
  readonly tools: ReadonlyArray<Record<string, unknown>> | undefined;
} & StandardizedPrompt;

/**
 * Event passed to the `onLanguageModelCallEnd` callback.
 *
 * Called after the model response has been normalized and parsed, but before
 * any client-side tool execution begins.
 */
export type LanguageModelCallEndEvent<TOOLS extends ToolSet = ToolSet> =
  CallbackModelInfo & {
    /** Unique identifier for this generation call, used to correlate events. */
    readonly callId: string;

    /** The unified reason why the model call finished. */
    readonly finishReason: StepResult<TOOLS>['finishReason'];

    /** The token usage reported by the model call. */
    readonly usage: LanguageModelUsage;

    /** The generated text from the model call. */
    readonly text: string;

    /** The generated reasoning text segments from the model call. */
    readonly reasoning: ReadonlyArray<{ text?: string }>;

    /** Files generated directly by the model call. */
    readonly files: ReadonlyArray<GeneratedFile>;

    /** Parsed tool calls emitted by the model call. */
    readonly toolCalls: ReadonlyArray<TypedToolCall<TOOLS>>;

    /** The provider-returned response id for this model call. */
    readonly responseId: string;
  };

/**
 * Callback that is set using the `experimental_onLanguageModelCallStart` option.
 *
 * Called immediately before the provider model call begins.
 * Unlike step-start callbacks, this is scoped to model work only and
 * excludes any later client-side tool execution.
 *
 * @param event - The event object containing model-call-specific inputs.
 */
export type OnLanguageModelCallStartCallback =
  Callback<LanguageModelCallStartEvent>;

/**
 * Callback that is set using the `experimental_onLanguageModelCallEnd` option.
 *
 * Called after the model response has been normalized and parsed, but before
 * any client-side tool execution begins.
 *
 * @param event - The event object containing model-call-specific outputs.
 */
export type OnLanguageModelCallEndCallback<TOOLS extends ToolSet = ToolSet> =
  Callback<LanguageModelCallEndEvent<TOOLS>>;
