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
    maxOutputTokens?: LanguageModelV2CallOptions['maxOutputTokens'] | null;
    temperature?: LanguageModelV2CallOptions['temperature'] | null;
    stopSequences?: LanguageModelV2CallOptions['stopSequences'] | null;
    topP?: LanguageModelV2CallOptions['topP'] | null;
    topK?: LanguageModelV2CallOptions['topK'] | null;
    presencePenalty?: LanguageModelV2CallOptions['presencePenalty'] | null;
    frequencyPenalty?: LanguageModelV2CallOptions['frequencyPenalty'] | null;
    responseFormat?: LanguageModelV2CallOptions['responseFormat'] | null;
    seed?: LanguageModelV2CallOptions['seed'] | null;
    tools?: LanguageModelV2CallOptions['tools'] | null;
    toolChoice?: LanguageModelV2CallOptions['toolChoice'] | null;
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

        // map all values that are null to undefined
        maxOutputTokens:
          settings.maxOutputTokens !== null
            ? (params.maxOutputTokens ?? settings.maxOutputTokens)
            : undefined,
        temperature:
          settings.temperature !== null
            ? // temperature: special case 0 or null
              params.temperature === 0 || params.temperature == null
              ? (settings.temperature ?? params.temperature)
              : params.temperature
            : undefined,
        stopSequences:
          settings.stopSequences !== null
            ? (params.stopSequences ?? settings.stopSequences)
            : undefined,
        topP:
          settings.topP !== null ? (params.topP ?? settings.topP) : undefined,
        topK:
          settings.topK !== null ? (params.topK ?? settings.topK) : undefined,
        presencePenalty:
          settings.presencePenalty !== null
            ? (params.presencePenalty ?? settings.presencePenalty)
            : undefined,
        frequencyPenalty:
          settings.frequencyPenalty !== null
            ? (params.frequencyPenalty ?? settings.frequencyPenalty)
            : undefined,
        responseFormat:
          settings.responseFormat !== null
            ? (params.responseFormat ?? settings.responseFormat)
            : undefined,
        seed:
          settings.seed !== null ? (params.seed ?? settings.seed) : undefined,
        tools:
          settings.tools !== null
            ? (params.tools ?? settings.tools)
            : undefined,
        toolChoice:
          settings.toolChoice !== null
            ? (params.toolChoice ?? settings.toolChoice)
            : undefined,

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
