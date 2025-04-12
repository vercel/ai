import type { EmbeddingModelV2Middleware } from '@ai-sdk/provider';

export const yourEmbedLogMiddleware: EmbeddingModelV2Middleware<string> = {
  wrapEmbed: async ({ doEmbed, params }) => {
    console.log('doEmbed called');
    console.log(`params: ${JSON.stringify(params, null, 2)}`);

    const result = await doEmbed();

    console.log('doEmbed finished');
    console.log(`embedding: ${result.embeddings}`);

    return result;
  },
};
