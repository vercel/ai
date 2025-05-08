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
        ...params,

        // apply defaults to undefined values
        maxOutputTokens:
          params.maxOutputTokens === undefined
            ? settings.maxOutputTokens
            : params.maxOutputTokens,
        temperature:
          params.temperature === undefined
            ? settings.temperature
            : params.temperature,
        stopSequences:
          params.stopSequences === undefined
            ? settings.stopSequences
            : params.stopSequences,
        topP: params.topP === undefined ? settings.topP : params.topP,
        topK: params.topK === undefined ? settings.topK : params.topK,
        presencePenalty:
          params.presencePenalty === undefined
            ? settings.presencePenalty
            : params.presencePenalty,
        frequencyPenalty:
          params.frequencyPenalty === undefined
            ? settings.frequencyPenalty
            : params.frequencyPenalty,
        responseFormat:
          params.responseFormat === undefined
            ? settings.responseFormat
            : params.responseFormat,
        seed: params.seed === undefined ? settings.seed : params.seed,
        tools: params.tools === undefined ? settings.tools : params.tools,
        toolChoice:
          params.toolChoice === undefined
            ? settings.toolChoice
            : params.toolChoice,

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
