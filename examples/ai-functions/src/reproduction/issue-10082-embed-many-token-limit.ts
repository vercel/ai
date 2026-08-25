import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, embedMany } from 'ai';

const valueCount = 2178;
const valueLength = 2399;
const aggregateTokenLimitMessage = 'max 300000 tokens per request';
const reproductionSignal =
  'ISSUE_10082_REPRODUCED: OpenAI rejected an automatically split embedMany request above the 300000-token aggregate limit';

function createValue(index: number) {
  const prefix = `embedding input ${index}: `;
  const content =
    'automatic batching must account for the aggregate token limit ';

  return (prefix + content.repeat(valueLength)).slice(0, valueLength);
}

async function main() {
  const requestInputCounts: number[] = [];
  const failedResponses: unknown[] = [];

  const openai = createOpenAI({
    fetch: async (input, init) => {
      const requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      if (Array.isArray(requestBody?.input)) {
        requestInputCounts.push(requestBody.input.length);
      }

      const response = await fetch(input, init);

      if (!response.ok) {
        failedResponses.push(
          await response
            .clone()
            .json()
            .catch(() => undefined),
        );
      }

      return response;
    },
  });

  const values = Array.from({ length: valueCount }, (_, index) =>
    createValue(index),
  );

  try {
    const { embeddings } = await embedMany({
      model: openai.embeddingModel('text-embedding-3-small'),
      values,
      maxRetries: 0,
      ...(process.env.OMIT_MAX_PARALLEL_CALLS === '1'
        ? {}
        : { maxParallelCalls: 4 }),
    });

    if (embeddings.length !== values.length) {
      throw new Error(
        `Expected ${values.length} embeddings, received ${embeddings.length}.`,
      );
    }
  } catch (error) {
    const observed = {
      valueCount: values.length,
      maxValueLength: Math.max(...values.map(value => value.length)),
      requestInputCounts,
      failedResponses,
    };

    console.error(JSON.stringify(observed, null, 2));

    if (
      APICallError.isInstance(error) &&
      error.statusCode === 400 &&
      error.message.includes(aggregateTokenLimitMessage)
    ) {
      console.error(reproductionSignal);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
