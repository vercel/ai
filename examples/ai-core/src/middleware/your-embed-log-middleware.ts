import type { EmbeddingModelV1Middleware } from 'ai';

export const yourEmbedLogMiddleware: EmbeddingModelV1Middleware<string> = {
  wrapEmbed: async ({ doEmbed, params }) => {
    console.log('doEmbed called');
    console.log(`params: ${JSON.stringify(params, null, 2)}`);

    const result = await doEmbed();

    console.log('doEmbed finished');
    console.log(`embedding: ${result.embeddings}`);

    return result;
  },
};
