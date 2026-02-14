import { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { LanguageModelMiddleware } from '../types';
import { mergeObjects } from '../util/merge-objects';

/**
 * Applies default settings for a language model.
 */
export function defaultSettingsMiddleware({
  settings,
}: {
  settings: Partial<{
    maxOutputTokens?: LanguageModelV3CallOptions['maxOutputTokens'];
    temperature?: LanguageModelV3CallOptions['temperature'];
    stopSequences?: LanguageModelV3CallOptions['stopSequences'];
    topP?: LanguageModelV3CallOptions['topP'];
    topK?: LanguageModelV3CallOptions['topK'];
    presencePenalty?: LanguageModelV3CallOptions['presencePenalty'];
    frequencyPenalty?: LanguageModelV3CallOptions['frequencyPenalty'];
    responseFormat?: LanguageModelV3CallOptions['responseFormat'];
    seed?: LanguageModelV3CallOptions['seed'];
    thinking?: LanguageModelV3CallOptions['thinking'];
    tools?: LanguageModelV3CallOptions['tools'];
    toolChoice?: LanguageModelV3CallOptions['toolChoice'];
    headers?: LanguageModelV3CallOptions['headers'];
    providerOptions?: LanguageModelV3CallOptions['providerOptions'];
  }>;
}): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      const mergedParams = mergeObjects(
        settings,
        params,
      ) as LanguageModelV3CallOptions;

      // `thinking` is a discriminated union and must be replaced atomically.
      if (params.thinking != null) {
        mergedParams.thinking = params.thinking;
      }

      return mergedParams;
    },
  };
}
