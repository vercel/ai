import { LanguageModelV3ToolChoice } from '@ai-sdk/provider';
import { ProviderOptions, SystemModelMessage } from '@ai-sdk/provider-utils';
import { ModelMessage } from '../prompt';
import { Output } from '../generate-text/output';
import { StepResult } from '../generate-text/step-result';
import { StopCondition } from '../generate-text/stop-condition';
import { ToolSet } from '../generate-text/tool-set';
import { TimeoutConfiguration } from '../prompt/call-settings';

/**
 * Callback that is set using the `experimental_onStepStart` option on the agent.
 *
 * Called when a step (LLM call) begins, before the provider is called.
 * Each step represents a single LLM invocation. Multiple steps occur when
 * using tool calls (the model may be called multiple times in a loop).
 *
 * @param event - The event object containing step configuration.
 */
export type ToolLoopAgentOnStepStartCallback<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> = (event: {
  /** Zero-based index of the current step. */
  readonly stepNumber: number;

  /** The model being used for this step. */
  readonly model: {
    /** The provider identifier. */
    readonly provider: string;
    /** The specific model identifier. */
    readonly modelId: string;
  };

  /**
   * The system message for this step.
   */
  readonly system:
    | string
    | SystemModelMessage
    | Array<SystemModelMessage>
    | undefined;

  /**
   * The messages that will be sent to the model for this step.
   * Uses the user-facing `ModelMessage` format.
   * May be overridden by prepareStep.
   */
  readonly messages: Array<ModelMessage>;

  /** The tools available for this generation. */
  readonly tools: TOOLS | undefined;

  /** The tool choice configuration for this step. */
  readonly toolChoice: LanguageModelV3ToolChoice | undefined;

  /** Limits which tools are available for this step. */
  readonly activeTools: Array<keyof TOOLS> | undefined;

  /** Array of results from previous steps (empty for first step). */
  readonly steps: ReadonlyArray<StepResult<TOOLS>>;

  /** Additional provider-specific options for this step. */
  readonly providerOptions: ProviderOptions | undefined;

  /**
   * Timeout configuration for the generation.
   * Can be a number (milliseconds) or an object with totalMs, stepMs, chunkMs.
   */
  readonly timeout: TimeoutConfiguration | undefined;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

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
   */
  readonly include:
    | {
        requestBody?: boolean;
        responseBody?: boolean;
      }
    | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, unknown> | undefined;

  /**
   * User-defined context object. May be updated from `prepareStep` between steps.
   */
  readonly experimental_context: unknown;
}) => PromiseLike<void> | void;
