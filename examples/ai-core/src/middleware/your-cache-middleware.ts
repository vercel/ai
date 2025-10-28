import { LanguageModelV3Middleware } from '@ai-sdk/provider';

const cache = new Map<string, any>();

export const yourCacheMiddleware: LanguageModelV3Middleware = {
  specificationVersion: 'v3',
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify(params);

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result = await doGenerate();

    cache.set(cacheKey, result);

    return result;
  },

  // here you would implement the caching logic for streaming
};
