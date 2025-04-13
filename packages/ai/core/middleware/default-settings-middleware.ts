import {
  LanguageModelV2CallOptions,
  LanguageModelV2Middleware,
  SharedV2ProviderOptions,
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
      providerOptions?: SharedV2ProviderOptions;
    }
  >;
}): LanguageModelV2Middleware {
  return {
    middlewareVersion: 'v2',
    transformParams: async ({ params }) => {
      return {
        ...settings,
        ...params,
        providerOptions: mergeObjects(
          settings.providerOptions,
          params.providerOptions,
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
