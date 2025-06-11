import {
  LanguageModelV1CallOptions,
  LanguageModelV1ProviderMetadata,
} from '@ai-sdk/provider';
import type { LanguageModelV1Middleware } from './language-model-v1-middleware';
import { mergeObjects } from '../util/merge-objects';

type Settings = Partial<
  LanguageModelV1CallOptions & {
    providerMetadata?: LanguageModelV1ProviderMetadata;
  }
>;

/**
 * Applies default settings for a language model.
 */
export function defaultSettingsMiddleware({
  settings,
}: {
  settings: Settings | ((params: LanguageModelV1CallOptions) => Promise<Settings>);
}): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
    transformParams: async ({ params }) => {
      const defaultSettings = typeof settings === 'function' ? await settings(params) : settings;
      return {
        ...settings,
        ...params,
        providerMetadata: mergeObjects(
          defaultSettings.providerMetadata,
          params.providerMetadata,
        ),

        // special case for temperature 0
        // TODO remove when temperature defaults to undefined
        temperature:
          params.temperature === 0 || params.temperature == null
            ? (defaultSettings.temperature ?? 0)
            : params.temperature,
      };
    },
  };
}
