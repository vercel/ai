import {
  LanguageModelV2CallOptions,
  LanguageModelV2Middleware,
} from '@ai-sdk/provider';
import { mergeObjects } from '../util/merge-objects';

/**
 * Applies default settings for a language model.
 */
export function defaultSettingsMiddleware({
  settings,
}: {
  settings: Partial<{
    maxOutputTokens?: LanguageModelV2CallOptions['maxOutputTokens'];
    temperature?: LanguageModelV2CallOptions['temperature'];
    stopSequences?: LanguageModelV2CallOptions['stopSequences'];
    topP?: LanguageModelV2CallOptions['topP'];
    topK?: LanguageModelV2CallOptions['topK'];
    presencePenalty?: LanguageModelV2CallOptions['presencePenalty'];
    frequencyPenalty?: LanguageModelV2CallOptions['frequencyPenalty'];
    responseFormat?: LanguageModelV2CallOptions['responseFormat'];
    seed?: LanguageModelV2CallOptions['seed'];
    tools?: LanguageModelV2CallOptions['tools'];
    toolChoice?: LanguageModelV2CallOptions['toolChoice'];
    headers?: LanguageModelV2CallOptions['headers'];
    providerOptions?: LanguageModelV2CallOptions['providerOptions'];
  }>;
}): LanguageModelV2Middleware {
  return {
    middlewareVersion: 'v2',
    transformParams: async ({ params }) => {
      return mergeObjects(settings, params) as LanguageModelV2CallOptions;
    },
  };
}
