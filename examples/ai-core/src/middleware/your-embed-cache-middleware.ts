import type { EmbeddingModelV1Middleware } from 'ai';

const cache = new Map<string, any>();

export const yourEmbedCacheMiddleware: EmbeddingModelV1Middleware<string> = {
  wrapEmbed: async ({ doEmbed, params }) => {
    const cacheKey = JSON.stringify(params);

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result = await doEmbed();

    cache.set(cacheKey, result);

    return result;
  },
};
