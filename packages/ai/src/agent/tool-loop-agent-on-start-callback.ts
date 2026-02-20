import {
  ModelMessage,
  ProviderOptions,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { Output } from '../generate-text/output';
import { StopCondition } from '../generate-text/stop-condition';
import { ToolSet } from '../generate-text/tool-set';
import { TimeoutConfiguration } from '../prompt/call-settings';
import { ToolChoice } from '../types/language-model';

/**
 * Callback that is set using the `onStart` option on the agent.
 *
 * Called when the agent operation begins, before any LLM calls.
 * Use this callback for logging, analytics, or initializing state at the
 * start of an agent run.
 *
 * @param event - The event object containing generation configuration.
 */
export type ToolLoopAgentOnStartCallback<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> = (event: {
  /** The model being used for generation. */
  readonly model: {
    /** The provider identifier (e.g., 'openai', 'anthropic'). */
    readonly provider: string;
    /** The specific model identifier (e.g., 'gpt-4o'). */
    readonly modelId: string;
  };

  /** The system message(s) provided to the model (mapped from agent instructions). */
  readonly system:
    | string
    | SystemModelMessage
    | Array<SystemModelMessage>
    | undefined;

  /** The prompt string or array of messages if using the prompt option. */
  readonly prompt: string | Array<ModelMessage> | undefined;

  /** The messages array if using the messages option. */
  readonly messages: Array<ModelMessage> | undefined;

  /** The tools available for this generation. */
  readonly tools: TOOLS | undefined;

  /** The tool choice strategy for this generation. */
  readonly toolChoice: ToolChoice<NoInfer<TOOLS>> | undefined;

  /** Limits which tools are available for the model to call. */
  readonly activeTools: Array<keyof TOOLS> | undefined;

  /** Maximum number of tokens to generate. */
  readonly maxOutputTokens: number | undefined;
  /** Sampling temperature for generation. */
  readonly temperature: number | undefined;
  /** Top-p (nucleus) sampling parameter. */
  readonly topP: number | undefined;
  /** Top-k sampling parameter. */
  readonly topK: number | undefined;
  /** Presence penalty for generation. */
  readonly presencePenalty: number | undefined;
  /** Frequency penalty for generation. */
  readonly frequencyPenalty: number | undefined;
  /** Sequences that will stop generation. */
  readonly stopSequences: string[] | undefined;
  /** Random seed for reproducible generation. */
  readonly seed: number | undefined;
  /** Maximum number of retries for failed requests. */
  readonly maxRetries: number;

  /**
   * Timeout configuration for the generation.
   * Can be a number (milliseconds) or an object with totalMs, stepMs, chunkMs.
   */
  readonly timeout: TimeoutConfiguration | undefined;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions | undefined;

  /**
   * Condition(s) for stopping the generation.
   * When the condition is an array, any of the conditions can be met to stop.
   */
  readonly stopWhen:
    | StopCondition<TOOLS>
    | Array<StopCondition<TOOLS>>
    | undefined;

  /** The output specification for structured outputs, if configured. */
  readonly output: OUTPUT | undefined;

  /** Abort signal for cancelling the operation. */
  readonly abortSignal: AbortSignal | undefined;

  /**
   * Settings for controlling what data is included in step results.
   * `requestBody` and `responseBody` control whether these are retained.
   */
  readonly include:
    | {
        requestBody?: boolean;
        responseBody?: boolean;
      }
    | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata passed to the generation. */
  readonly metadata: Record<string, unknown> | undefined;

  /**
   * User-defined context object that flows through the entire generation lifecycle.
   * Can be accessed and modified in `prepareStep` and tool `execute` functions.
   */
  readonly experimental_context: unknown;
}) => PromiseLike<void> | void;
