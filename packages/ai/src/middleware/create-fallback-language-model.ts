import type {
  LanguageModelV2,
  LanguageModelV3,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import { asLanguageModelV4 } from '../model/as-language-model-v4';
import { resolveLanguageModel } from '../model/resolve-model';
import type { LanguageModel } from '../types/language-model';

/**
 * Predicate that decides whether a particular error should trigger a fallback
 * attempt against the next model in the chain.
 *
 * @param error - the error thrown by `doGenerate` / `doStream` on a model.
 * @param modelIndex - the index of the model that threw, into the original
 *   `models` array.
 * @returns `true` to try the next model, `false` to re-throw immediately.
 *
 * Defaults to retrying on every error.
 */
export type ShouldRetryFallback = (
  error: unknown,
  modelIndex: number,
) => boolean | Promise<boolean>;

/**
 * Creates a fallback `LanguageModelV4` that wraps a chain of underlying models.
 * Calls are attempted against the models in order; if a call throws and the
 * `shouldRetry` predicate (if supplied) returns `true`, the next model is
 * tried. If all models fail, the *last* error is re-thrown.
 *
 * Typical use is provider/model resilience:
 *
 * ```ts
 * import { createFallbackLanguageModel } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { anthropic } from '@ai-sdk/anthropic';
 *
 * const resilient = createFallbackLanguageModel({
 *   models: [openai('gpt-5-mini'), anthropic('claude-3-5-haiku-latest')],
 *   shouldRetry: error => isTransient(error),
 * });
 *
 * const result = await generateText({ model: resilient, prompt: '…' });
 * ```
 *
 * ### Streaming semantics
 *
 * Fallback is only attempted while the underlying `doStream` *promise* is
 * still pending. Once the stream has started emitting parts, any error inside
 * the stream is forwarded to the caller untouched — falling back mid-stream
 * would force callers to deal with partial output from one provider stitched
 * to output from another. Callers that need that behaviour should layer their
 * own buffering on top.
 *
 * ### Other notes
 *
 * - `supportedUrls` is read from the first model in the chain. If your
 *   fallback chain mixes providers with different URL support, the conservative
 *   set is the first model's. Override on the returned model if you need more.
 * - The returned model's `provider` / `modelId` default to `'fallback'` and a
 *   synthetic identifier composed from the underlying models. Override via the
 *   `providerId` / `modelId` options.
 *
 * Closes vercel/ai#2636 (request: retry strategies and fallbacks).
 */
export function createFallbackLanguageModel(options: {
  /**
   * Ordered list of models. Position `0` is the primary; remaining positions
   * are fallbacks tried in order on retryable errors. Must contain at least
   * one model.
   */
  models: LanguageModel[];

  /**
   * Optional predicate. Defaults to retrying on every error.
   */
  shouldRetry?: ShouldRetryFallback;

  /**
   * Optional override for the resulting model's `modelId`. Defaults to a
   * synthetic identifier composed from the underlying models.
   */
  modelId?: string;

  /**
   * Optional override for the resulting model's `provider`. Defaults to
   * `'fallback'`.
   */
  providerId?: string;
}): LanguageModelV4 {
  const { models, shouldRetry, modelId, providerId } = options;

  if (models.length === 0) {
    throw new Error(
      'createFallbackLanguageModel: at least one model must be provided',
    );
  }

  const resolved: LanguageModelV4[] = models.map(m =>
    asLanguageModelV4(
      typeof m === 'string'
        ? (resolveLanguageModel(m) as LanguageModelV2 | LanguageModelV3 | LanguageModelV4)
        : (m as LanguageModelV2 | LanguageModelV3 | LanguageModelV4),
    ),
  );

  const syntheticModelId =
    modelId ??
    `fallback(${resolved.map(m => `${m.provider}:${m.modelId}`).join(',')})`;

  async function shouldTryNext(error: unknown, index: number): Promise<boolean> {
    if (shouldRetry === undefined) {
      return true;
    }
    return await shouldRetry(error, index);
  }

  const doGenerate: LanguageModelV4['doGenerate'] = async (
    callOptions: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> => {
    let lastError: unknown;
    for (let i = 0; i < resolved.length; i++) {
      try {
        return await resolved[i].doGenerate(callOptions);
      } catch (error) {
        lastError = error;
        const isLast = i === resolved.length - 1;
        if (isLast || !(await shouldTryNext(error, i))) {
          throw error;
        }
      }
    }
    // Unreachable: the loop either returns or throws.
    throw lastError;
  };

  const doStream: LanguageModelV4['doStream'] = async (
    callOptions: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> => {
    let lastError: unknown;
    for (let i = 0; i < resolved.length; i++) {
      try {
        // Errors thrown *before* the stream begins fall here (e.g. auth
        // failure, network refused, 429 before any bytes). Once the
        // ReadableStream below has started yielding, mid-stream errors flow
        // through the stream itself and we deliberately do not retry — see
        // the streaming-semantics note on `createFallbackLanguageModel`.
        return await resolved[i].doStream(callOptions);
      } catch (error) {
        lastError = error;
        const isLast = i === resolved.length - 1;
        if (isLast || !(await shouldTryNext(error, i))) {
          throw error;
        }
      }
    }
    throw lastError;
  };

  return {
    specificationVersion: 'v4',
    provider: providerId ?? 'fallback',
    modelId: syntheticModelId,
    supportedUrls: resolved[0].supportedUrls,
    doGenerate,
    doStream,
  };
}
