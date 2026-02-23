import { LanguageModelV3 } from '@ai-sdk/provider';
import { delay, isAbortError } from '@ai-sdk/provider-utils';
import { LanguageModel } from '../types/language-model';
import { resolveLanguageModel } from '../model/resolve-model';

export type FallbackOptions = {
  /**
   * List of language models to try in order.
   * Each model is attempted sequentially - if one fails, the next is tried.
   * At least two models must be provided.
   */
  models: [LanguageModel, LanguageModel, ...LanguageModel[]];

  /**
   * Delay in milliseconds before retrying with the next model.
   * @default 0
   */
  initialDelayInMs?: number;

  /**
   * Factor to multiply the delay by after each failed attempt.
   * @default 1
   */
  backoffFactor?: number;

  /**
   * Called when a model fails and the next model will be tried.
   */
  onModelFailure?: (params: {
    model: LanguageModelV3;
    error: unknown;
    modelIndex: number;
  }) => void;
};

/**
 * Creates a language model that tries multiple models in sequence.
 * If the first model fails, it automatically falls back to the next model
 * in the list. Supports optional exponential backoff between attempts.
 *
 * @example
 * ```ts
 * import { withFallback } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { anthropic } from '@ai-sdk/anthropic';
 *
 * const model = withFallback({
 *   models: [openai('gpt-4o'), anthropic('claude-sonnet-4-20250514')],
 * });
 *
 * const result = await generateText({ model, prompt: 'Hello' });
 * ```
 */
export function withFallback(options: FallbackOptions): LanguageModelV3 {
  const {
    models,
    initialDelayInMs = 0,
    backoffFactor = 1,
    onModelFailure,
  } = options;

  const resolvedModels = models.map(m => resolveLanguageModel(m));
  const primaryModel = resolvedModels[0];

  async function tryModels<T>(
    operation: (model: LanguageModelV3) => PromiseLike<T>,
  ): Promise<T> {
    let currentDelay = initialDelayInMs;

    for (let i = 0; i < resolvedModels.length; i++) {
      try {
        return await operation(resolvedModels[i]);
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        onModelFailure?.({
          model: resolvedModels[i],
          error,
          modelIndex: i,
        });

        // If this was the last model, throw
        if (i === resolvedModels.length - 1) {
          throw error;
        }

        // Wait before trying next model
        if (currentDelay > 0) {
          await delay(currentDelay);
          currentDelay *= backoffFactor;
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error('All fallback models failed');
  }

  return {
    specificationVersion: 'v3',
    provider: primaryModel.provider,
    modelId: `fallback(${resolvedModels.map(m => m.modelId).join(', ')})`,
    supportedUrls: primaryModel.supportedUrls,

    doGenerate(options) {
      return tryModels(model => model.doGenerate(options));
    },

    doStream(options) {
      return tryModels(model => model.doStream(options));
    },
  };
}
