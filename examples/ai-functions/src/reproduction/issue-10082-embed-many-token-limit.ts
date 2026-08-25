import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, embedMany } from 'ai';

const chunkCount = 2178;
const chunk = 'token '.repeat(400).trim();
const expectedAggregateLimitErrorCode = 'max_tokens_per_request';

type OpenAIErrorData = {
  error?: {
    code?: unknown;
  };
};

type CaseResult = {
  label: string;
  requestValueCounts: number[];
  embeddingCount?: number;
  statusCode?: number;
  message?: string;
};

async function runCase({
  label,
  maxParallelCalls,
}: {
  label: string;
  maxParallelCalls?: number;
}): Promise<CaseResult> {
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
      ...(maxParallelCalls == null ? {} : { maxParallelCalls }),
    });

    if (result.embeddings.length !== values.length) {
      throw new Error(
        `${label}: expected ${values.length} embeddings, received ${result.embeddings.length}.`,
      );
    }

    return {
      label,
      requestValueCounts,
      embeddingCount: result.embeddings.length,
    };
  } catch (error) {
    if (
      !APICallError.isInstance(error) ||
      error.statusCode !== 400 ||
      (error.data as OpenAIErrorData | undefined)?.error?.code !==
        expectedAggregateLimitErrorCode
    ) {
      throw error;
    }

    return {
      label,
      requestValueCounts,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
}

async function main() {
  const results = [
    await runCase({ label: 'maxParallelCalls: 4', maxParallelCalls: 4 }),
    await runCase({ label: 'maxParallelCalls omitted' }),
  ];

  console.log(
    JSON.stringify(
      {
        chunkCount,
        maxChunkCharacters: chunk.length,
        results,
      },
      null,
      2,
    ),
  );

  if (results.some(result => result.statusCode === 400)) {
    throw new Error(
      'Reproduced issue #10082: embedMany sent a request above the OpenAI 300,000-token aggregate limit instead of splitting it into smaller requests.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
