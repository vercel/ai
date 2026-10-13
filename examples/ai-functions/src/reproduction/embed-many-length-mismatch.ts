import {
  embed,
  embedMany,
  InvalidResponseDataError,
  type EmbeddingModel,
} from 'ai';

type MismatchCase = {
  name: string;
  values: string[];
  maxEmbeddingsPerCall: number | undefined;
  embeddingsPerCall: number;
};

const mismatchCases: MismatchCase[] = [
  {
    name: 'fast-empty',
    values: ['alpha', 'beta'],
    maxEmbeddingsPerCall: undefined,
    embeddingsPerCall: 0,
  },
  {
    name: 'fast-truncated',
    values: ['alpha', 'beta'],
    maxEmbeddingsPerCall: undefined,
    embeddingsPerCall: 1,
  },
  {
    name: 'chunked-empty',
    values: ['alpha', 'beta', 'gamma', 'delta'],
    maxEmbeddingsPerCall: 2,
    embeddingsPerCall: 0,
  },
  {
    name: 'chunked-truncated',
    values: ['alpha', 'beta', 'gamma', 'delta'],
    maxEmbeddingsPerCall: 2,
    embeddingsPerCall: 1,
  },
];

function createModel({
  maxEmbeddingsPerCall,
  embeddingsPerCall,
}: {
  maxEmbeddingsPerCall: number | undefined;
  embeddingsPerCall: number;
}): EmbeddingModel {
  return {
    specificationVersion: 'v3',
    provider: 'issue-20359-reproduction',
    modelId: 'mismatched-embedding-count',
    maxEmbeddingsPerCall,
    supportsParallelCalls: false,
    async doEmbed({ values }) {
      return {
        embeddings: Array.from(
          { length: Math.min(embeddingsPerCall, values.length) },
          (_, index) => [index],
        ),
        warnings: [],
      };
    },
  };
}

async function assertEmbedRejectsEmptyResponse() {
  try {
    await embed({
      model: createModel({
        maxEmbeddingsPerCall: undefined,
        embeddingsPerCall: 0,
      }),
      value: 'alpha',
      maxRetries: 0,
    });
  } catch (error) {
    if (InvalidResponseDataError.isInstance(error)) {
      return;
    }

    throw error;
  }

  throw new Error(
    'Secondary assertion failed: embed() accepted an empty embedding response',
  );
}

async function main() {
  await assertEmbedRejectsEmptyResponse();

  const silentlyAccepted: string[] = [];

  for (const mismatchCase of mismatchCases) {
    try {
      const result = await embedMany({
        model: createModel(mismatchCase),
        values: mismatchCase.values,
        maxRetries: 0,
      });

      silentlyAccepted.push(
        `${mismatchCase.name}=${result.values.length}/${result.embeddings.length}`,
      );
    } catch (error) {
      if (!InvalidResponseDataError.isInstance(error)) {
        throw error;
      }
    }
  }

  if (silentlyAccepted.length > 0) {
    throw new Error(
      `ISSUE_20359_REPRODUCED: embedMany silently accepted embedding-count mismatches: ${silentlyAccepted.join(
        ', ',
      )}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
