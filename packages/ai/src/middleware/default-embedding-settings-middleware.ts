import { EmbeddingModelCallOptions } from '@ai-sdk/provider';
import { EmbeddingModelMiddleware } from '../types';
import { mergeObjects } from '../util/merge-objects';

/**
 * Applies default settings for a embedding model.
 */
export function defaultEmbeddingSettingsMiddleware({
  settings,
}: {
  settings: Partial<{
    headers?: EmbeddingModelCallOptions<string>['headers'];
    providerOptions?: EmbeddingModelCallOptions<string>['providerOptions'];
  }>;
}): EmbeddingModelMiddleware {
  return {
    middlewareVersion: 'v3',
    transformParams: async ({ params }) => {
      return mergeObjects(
        settings,
        params,
      ) as EmbeddingModelCallOptions<string>;
    },
  };
}
