import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, embedMany } from 'ai';

const chunkCount = 2178;
const chunk = 'token '.repeat(400).trim();

async function main() {
  const requestValueCounts: number[] = [];

  const openai = createOpenAI({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as { input?: unknown[] };
        requestValueCounts.push(body.input?.length ?? 0);
      }

      return fetch(input, init);
    },
  });

  const values = Array.from({ length: chunkCount }, () => chunk);

  try {
    const result = await embedMany({
      model: openai.textEmbeddingModel('text-embedding-3-small'),
      values,
      maxParallelCalls: 4,
    });

    console.log(
      JSON.stringify(
        {
          chunkCount: values.length,
          maxChunkCharacters: chunk.length,
          requestValueCounts,
          embeddingCount: result.embeddings.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          chunkCount: values.length,
          maxChunkCharacters: chunk.length,
          requestValueCounts,
          statusCode: error.statusCode,
          message: error.message,
          responseBody: error.responseBody,
        },
        null,
        2,
      ),
    );

    throw new Error(
      'Reproduced issue #10082: embedMany sent a request above the OpenAI 300,000-token aggregate limit instead of splitting it into smaller requests.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
