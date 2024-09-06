import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import type { Experimental_LanguageModelV1Middleware as LanguageModelV1Middleware } from 'ai';

export const yourCacheMiddleware: LanguageModelV1Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    if (isCached(params)) {
      return fromCache(params);
    }

    const result = await doGenerate();

    saveToCache(params, result);

    return result;
  },
};

function isCached(params: LanguageModelV1CallOptions): boolean {
  return false;
}

function fromCache(
  params: LanguageModelV1CallOptions,
): Awaited<ReturnType<LanguageModelV1['doGenerate']>> {
  return {} as any;
}

function saveToCache(
  params: LanguageModelV1CallOptions,
  result: Awaited<ReturnType<LanguageModelV1['doGenerate']>>,
) {}
