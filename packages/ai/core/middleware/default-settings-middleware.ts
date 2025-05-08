import {
  LanguageModelV2CallOptions,
  LanguageModelV2Middleware,
} from '@ai-sdk/provider';
import { mergeObjects } from '../../src/util/merge-objects';

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
      return {
        ...settings,
        ...params,

        // apply defaults to undefined values
        maxOutputTokens: params.maxOutputTokens ?? settings.maxOutputTokens,
        temperature: params.temperature ?? settings.temperature,
        stopSequences: params.stopSequences ?? settings.stopSequences,
        topP: params.topP ?? settings.topP,
        topK: params.topK ?? settings.topK,
        presencePenalty: params.presencePenalty ?? settings.presencePenalty,
        frequencyPenalty: params.frequencyPenalty ?? settings.frequencyPenalty,
        responseFormat: params.responseFormat ?? settings.responseFormat,
        seed: params.seed ?? settings.seed,
        tools: params.tools ?? settings.tools,
        toolChoice: params.toolChoice ?? settings.toolChoice,

        // headers: deep merge
        headers: mergeObjects(settings.headers, params.headers),

        // provider options: deep merge
        providerOptions: mergeObjects(
          settings.providerOptions,
          params.providerOptions,
        ),
      };
    },
  };
}
