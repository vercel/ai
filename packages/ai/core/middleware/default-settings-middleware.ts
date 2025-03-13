import {
  LanguageModelV1CallOptions,
  LanguageModelV1ProviderMetadata,
} from '@ai-sdk/provider';
import type { LanguageModelV1Middleware } from './language-model-v1-middleware';
import { mergeObjects } from '../util/merge-objects';

/**
 * Applies default settings for a language model.
 */
export function defaultSettingsMiddleware({
  settings,
}: {
  settings: Partial<
    LanguageModelV1CallOptions & {
      providerMetadata?: LanguageModelV1ProviderMetadata;
    }
  >;
}): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
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
