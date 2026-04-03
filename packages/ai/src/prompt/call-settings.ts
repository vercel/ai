import { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import type { ToolSet } from '@ai-sdk/provider-utils';

/**
 * Timeout configuration for API calls. Can be specified as:
 * - A number representing milliseconds
 * - An object with `totalMs` property for the total timeout in milliseconds
 * - An object with `stepMs` property for the timeout of each step in milliseconds
 * - An object with `chunkMs` property for the timeout between stream chunks (streaming only)
 * - An object with `toolMs` property for the default timeout for all tool executions
 * - An object with `tools` property for per-tool timeout overrides using `{toolName}Ms` keys
 */
export type TimeoutConfiguration<TOOLS extends ToolSet> =
  | number
  | {
      totalMs?: number;
      stepMs?: number;
      chunkMs?: number;
      toolMs?: number;
      tools?: Partial<Record<`${keyof TOOLS & string}Ms`, number>>;
    };

/**
 * Extracts the total timeout value in milliseconds from a TimeoutConfiguration.
 *
 * @param timeout - The timeout configuration.
 * @returns The total timeout in milliseconds, or undefined if no timeout is configured.
 */
export function getTotalTimeoutMs(
  timeout: TimeoutConfiguration<any> | undefined,
): number | undefined {
  if (timeout == null) {
    return undefined;
  }
  if (typeof timeout === 'number') {
    return timeout;
  }
  return timeout.totalMs;
}

/**
 * Extracts the step timeout value in milliseconds from a TimeoutConfiguration.
 *
 * @param timeout - The timeout configuration.
 * @returns The step timeout in milliseconds, or undefined if no step timeout is configured.
 */
export function getStepTimeoutMs(
  timeout: TimeoutConfiguration<any> | undefined,
): number | undefined {
  if (timeout == null || typeof timeout === 'number') {
    return undefined;
  }
  return timeout.stepMs;
}

/**
 * Extracts the chunk timeout value in milliseconds from a TimeoutConfiguration.
 * This timeout is for streaming only - it aborts if no new chunk is received within the specified duration.
 *
 * @param timeout - The timeout configuration.
 * @returns The chunk timeout in milliseconds, or undefined if no chunk timeout is configured.
 */
export function getChunkTimeoutMs(
  timeout: TimeoutConfiguration<any> | undefined,
): number | undefined {
  if (timeout == null || typeof timeout === 'number') {
    return undefined;
  }
  return timeout.chunkMs;
}

export function getToolTimeoutMs<TOOLS extends ToolSet>(
  timeout: TimeoutConfiguration<TOOLS> | undefined,
  toolName: keyof TOOLS & string,
): number | undefined {
  if (timeout == null || typeof timeout === 'number') {
    return undefined;
  }

  return timeout.tools?.[`${toolName}Ms`] ?? timeout.toolMs;
}

export type CallSettings = {
  /**
   * Maximum number of tokens to generate.
   */
  maxOutputTokens?: number;

  /**
   * Temperature setting. The range depends on the provider and model.
   *
   * It is recommended to set either `temperature` or `topP`, but not both.
   */
  temperature?: number;

  /**
   * Nucleus sampling. This is a number between 0 and 1.
   *
   * E.g. 0.1 would mean that only tokens with the top 10% probability mass
   * are considered.
   *
   * It is recommended to set either `temperature` or `topP`, but not both.
   */
  topP?: number;

  /**
   * Only sample from the top K options for each subsequent token.
   *
   * Used to remove "long tail" low probability responses.
   * Recommended for advanced use cases only. You usually only need to use temperature.
   */
  topK?: number;

  /**
   * Presence penalty setting. It affects the likelihood of the model to
   * repeat information that is already in the prompt.
   *
   * The presence penalty is a number between -1 (increase repetition)
   * and 1 (maximum penalty, decrease repetition). 0 means no penalty.
   */
  presencePenalty?: number;

  /**
   * Frequency penalty setting. It affects the likelihood of the model
   * to repeatedly use the same words or phrases.
   *
   * The frequency penalty is a number between -1 (increase repetition)
   * and 1 (maximum penalty, decrease repetition). 0 means no penalty.
   */
  frequencyPenalty?: number;

  /**
   * Stop sequences.
   * If set, the model will stop generating text when one of the stop sequences is generated.
   * Providers may have limits on the number of stop sequences.
   */
  stopSequences?: string[];

  /**
   * The seed (integer) to use for random sampling. If set and supported
   * by the model, calls will generate deterministic results.
   */
  seed?: number;

  /**
   * Reasoning effort level for the model. Controls how much reasoning
   * the model performs before generating a response.
   *
   * Use `'provider-default'` to use the provider's default reasoning level.
   * Use `'none'` to disable reasoning (if supported by the provider).
   */
  reasoning?: LanguageModelV4CallOptions['reasoning'];

  /**
   * Maximum number of retries. Set to 0 to disable retries.
   *
   * @default 2
   */
  maxRetries?: number;

  /**
   * Abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;
};
