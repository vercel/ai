import {
  LanguageModelV2CallOptions,
  LanguageModelV2Middleware,
  LanguageModelV2ProviderMetadata,
} from '@ai-sdk/provider';
import { mergeObjects } from '../util/merge-objects';

/**
 * Applies default settings for a language model.
 */
export function defaultSettingsMiddleware({
  settings,
}: {
  settings: Partial<
    LanguageModelV2CallOptions & {
      providerMetadata?: LanguageModelV2ProviderMetadata;
    }
  >;
}): LanguageModelV2Middleware {
  return {
    middlewareVersion: 'v2',
    transformParams: async ({ params }) => {
      return {
        ...settings,
        ...params,
        providerMetadata: mergeObjects(
          settings.providerMetadata,
          params.providerMetadata,
        ),

        // special case for temperature 0
        // TODO remove when temperature defaults to undefined
        temperature:
          params.temperature === 0 || params.temperature == null
            ? (settings.temperature ?? 0)
            : params.temperature,
      };
    },
  };
}
