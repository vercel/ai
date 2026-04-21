import type {
  Arrayable,
  Context,
  InferToolSetContext,
  ProviderOptions,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import type { TimeoutConfiguration } from '../prompt/request-options';
import type { ToolChoice } from '../types/language-model';
import type { LanguageModelUsage } from '../types/usage';
import type { Output } from './output';
import type { StepResult } from './step-result';
import type { StopCondition } from './stop-condition';
import { TextStreamPart } from './stream-text-result';
import type { StandardizedPrompt } from '../prompt/standardize-prompt';

/**
 * Common model information used across callback events.
 */
export interface CallbackModelInfo {
  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;
  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;
}

/**
 * Event passed to the `onStart` callback.
 *
 * Called when the generation operation begins, before any LLM calls.
 */

// TODO: rename OnStartEvent to GenerateTextStartEvent
export type OnStartEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type (e.g. 'ai.generateText' or 'ai.streamText'). */
  // move to the telemetry dispatcher
  readonly operationId: string;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** The tools available for this generation. */
  readonly tools: TOOLS | undefined;

  /** The tool choice strategy for this generation. */
  readonly toolChoice: ToolChoice<NoInfer<TOOLS>> | undefined;

  /** Limits which tools are available for the model to call. */
  readonly activeTools: Array<keyof TOOLS> | undefined;

  /** Maximum number of retries for failed requests. */
  readonly maxRetries: number;

  /**
   * Timeout configuration for the generation.
   * Can be a number (milliseconds) or an object with totalMs, stepMs, chunkMs, toolMs, and per-tool overrides via tools.
   */
  readonly timeout: TimeoutConfiguration<TOOLS> | undefined;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions | undefined;

  /**
   * Condition(s) for stopping the generation.
   * When the condition is an array, any of the conditions can be met to stop.
   */
  readonly stopWhen: Arrayable<StopCondition<NoInfer<TOOLS>, RUNTIME_CONTEXT>>;

  /** The output specification for structured outputs, if configured. */
  readonly output: OUTPUT | undefined;

  /**
   * Tool context.
   */
  readonly toolsContext: InferToolSetContext<TOOLS>;

  /**
   * User-defined runtime context.
   */
  readonly runtimeContext: RUNTIME_CONTEXT;
} & LanguageModelCallOptions &
  StandardizedPrompt;

/**
 * Event passed to the `onStepStart` callback.
 *
 * Called when a step (LLM call) begins, before the provider is called.
 * Each step represents a single LLM invocation.
 */

// TODO: use as types
// rename to GenerateTextStepStartEvent
export type OnStepStartEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = {
  /** Unique identifier for this generation call, used to correlate events. */
  readonly callId: string;

  /** The provider identifier (e.g., 'openai', 'anthropic'). */
  readonly provider: string;

  /** The specific model identifier (e.g., 'gpt-4o'). */
  readonly modelId: string;

  /** The tools available for this generation. */
  readonly tools: TOOLS | undefined;

  /** The tool choice configuration for this step. */
  readonly toolChoice: ToolChoice<NoInfer<TOOLS>> | undefined;

  /** Limits which tools are available for this step. */
  readonly activeTools: Array<keyof TOOLS> | undefined;

  /** Array of results from previous steps (empty for first step). */
  readonly steps: ReadonlyArray<StepResult<TOOLS, RUNTIME_CONTEXT>>;

  /** Additional provider-specific options for this step. */
  readonly providerOptions: ProviderOptions | undefined;

  /** The output specification for structured outputs, if configured. */
  readonly output: OUTPUT | undefined;

  /**
   * Runtime context. May be updated from `prepareStep` between steps.
   */
  readonly runtimeContext: RUNTIME_CONTEXT;

  /**
   * Tool context. May be updated from `prepareStep` between steps.
   */
  readonly toolsContext: InferToolSetContext<TOOLS>;
} & StandardizedPrompt;

/**
 * Event passed to the `onChunk` callback.
 *
 * Called for each chunk received during streaming (`streamText` only).
 * The chunk is either a content part (text-delta, tool-call, etc.) or
 * a stream lifecycle marker (`ai.stream.firstChunk` / `ai.stream.finish`).
 */
export interface OnChunkEvent<TOOLS extends ToolSet = ToolSet> {
  readonly chunk:
    | TextStreamPart<TOOLS>
    | {
        readonly type: 'ai.stream.firstChunk' | 'ai.stream.finish';
        readonly callId: string;
        readonly stepNumber: number;
        readonly attributes?: Record<string, unknown>;
      };
}

/**
 * Event passed to the `onStepFinish` callback.
 *
 * Called when a step (LLM call) completes.
 * Includes the StepResult for that step along with the call identifier.
 */
export type OnStepFinishEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = StepResult<TOOLS, RUNTIME_CONTEXT>;

/**
 * Event passed to the `onFinish` callback.
 *
 * Called when the entire generation completes (all steps finished).
 * Includes the final step's result along with aggregated data from all steps.
 */
export type OnFinishEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = StepResult<TOOLS, RUNTIME_CONTEXT> & {
  /** Array containing results from all steps in the generation. */
  readonly steps: StepResult<TOOLS, RUNTIME_CONTEXT>[];

  /** Aggregated token usage across all steps. */
  readonly totalUsage: LanguageModelUsage;
};
