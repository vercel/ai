import type {
  Context,
  InferToolSetContext,
  ProviderOptions,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import type { TimeoutConfiguration } from '../prompt/request-options';
import type { StandardizedPrompt } from '../prompt/standardize-prompt';
import type { ToolChoice } from '../types/language-model';
import type { LanguageModelUsage } from '../types/usage';
import type { Callback } from '../util/callback';
import type { ActiveTools } from './active-tools';
import type { Output } from './output';
import type { StepResult } from './step-result';
import type { TextStreamPart } from './stream-text-result';

/**
 * Event passed to the `onStart` callback.
 *
 * Called when the generation operation begins, before any LLM calls.
 */
export type GenerateTextStartEvent<
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
  readonly activeTools: ActiveTools<TOOLS>;

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
export type GenerateTextStepStartEvent<
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

  /** Zero-based index of the current step. */
  readonly stepNumber: number;

  /** The tools available for this generation. */
  readonly tools: TOOLS | undefined;

  /** The tool choice configuration for this step. */
  readonly toolChoice: ToolChoice<NoInfer<TOOLS>> | undefined;

  /** Limits which tools are available for this step. */
  readonly activeTools: ActiveTools<TOOLS>;

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
export type StreamTextChunkEvent<TOOLS extends ToolSet = ToolSet> = {
  readonly chunk:
    | TextStreamPart<TOOLS>
    | {
        readonly type: 'ai.stream.firstChunk' | 'ai.stream.finish';
        readonly callId: string;
        readonly stepNumber: number;
        readonly attributes?: Record<string, unknown>;
      };
};

/**
 * Event passed to the `onStepFinish` callback.
 *
 * Called when a step (LLM call) completes.
 * Includes the StepResult for that step along with the call identifier.
 */
export type GenerateTextStepEndEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = StepResult<TOOLS, RUNTIME_CONTEXT>;

/**
 * Event passed to the `onFinish` callback.
 *
 * Called when the entire generation completes (all steps finished).
 * Includes the final step's result along with aggregated data from all steps.
 */
export type GenerateTextEndEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = StepResult<TOOLS, RUNTIME_CONTEXT> & {
  /** Array containing results from all steps in the generation. */
  readonly steps: StepResult<TOOLS, RUNTIME_CONTEXT>[];

  /** Aggregated token usage across all steps. */
  readonly totalUsage: LanguageModelUsage;
};

/** @deprecated Use `GenerateTextStartEvent` instead. */
export type OnStartEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = GenerateTextStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>;

/** @deprecated Use `GenerateTextStepStartEvent` instead. */
export type OnStepStartEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = GenerateTextStepStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>;

/** @deprecated Use `StreamTextChunkEvent` instead. */
export type OnChunkEvent<TOOLS extends ToolSet = ToolSet> =
  StreamTextChunkEvent<TOOLS>;

/** @deprecated Use `GenerateTextStepEndEvent` instead. */
export type OnStepFinishEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = GenerateTextStepEndEvent<TOOLS, RUNTIME_CONTEXT>;

/** @deprecated Use `GenerateTextEndEvent` instead. */
export type OnFinishEvent<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = GenerateTextEndEvent<TOOLS, RUNTIME_CONTEXT>;

/**
 * Callback that is set using the `experimental_onStart` option.
 *
 * Called when the generateText operation begins, before any LLM calls.
 * Use this callback for logging, analytics, or initializing state at the
 * start of a generation.
 *
 * @param event - The event object containing generation configuration.
 */
export type GenerateTextOnStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<GenerateTextStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

/**
 * Callback that is set using the `experimental_onStepStart` option.
 *
 * Called when a step (LLM call) begins, before the provider is called.
 * Each step represents a single LLM invocation. Multiple steps occur when
 * using tool calls (the model may be called multiple times in a loop).
 *
 * @param event - The event object containing step configuration.
 */
export type GenerateTextOnStepStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<GenerateTextStepStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

/**
 * Callback that is set using the `onStepFinish` option.
 *
 * Called when a step (LLM call) completes. The event includes all step result
 * properties (text, tool calls, usage, etc.) along with additional metadata.
 *
 * @param stepResult - The result of the step.
 */
export type GenerateTextOnStepFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<GenerateTextStepEndEvent<TOOLS, RUNTIME_CONTEXT>>;

/**
 * Callback that is set using the `onFinish` option.
 *
 * Called when the entire generation completes (all steps finished).
 * The event includes the final step's result properties along with
 * aggregated data from all steps.
 *
 * @param event - The final result along with aggregated step data.
 */
export type GenerateTextOnFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<GenerateTextEndEvent<TOOLS, RUNTIME_CONTEXT>>;
