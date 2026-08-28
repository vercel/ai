import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { embedMany } from 'ai';

const documentedVertexBatchLimit = 250;

async function main() {
  const requestSizes: number[] = [];

  const vertex = createGoogleVertex({
    apiKey: 'test-api-key',
    baseURL: 'https://vertex.example.test/v1/publishers/google',
    fetch: async (_url, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body.');
      }

      const body = JSON.parse(init.body) as { instances?: unknown[] };

      if (!Array.isArray(body.instances)) {
        throw new Error('Expected a Vertex :predict request.');
      }

      const requestSize = body.instances.length;
      requestSizes.push(requestSize);

      if (requestSize > documentedVertexBatchLimit) {
        return Response.json(
          {
            error: {
              code: 400,
              message: `At most ${documentedVertexBatchLimit} input texts are allowed per request.`,
              status: 'INVALID_ARGUMENT',
            },
          },
          { status: 400 },
        );
      }

      return Response.json({
        predictions: body.instances.map((_, index) => ({
          embeddings: {
            statistics: { token_count: 1 },
            values: [index],
          },
        })),
      });
    },
  });

  const predictModel = vertex.embeddingModel('gemini-embedding-001');

  try {
    const result = await embedMany({
      model: predictModel,
      values: Array.from({ length: 251 }, (_, index) => `document ${index}`),
      maxRetries: 0,
    });

    if (result.embeddings.length !== 251) {
      throw new Error(
        `Expected 251 embeddings, received ${result.embeddings.length}.`,
      );
    }
  } catch (error) {
    const oversizedRequest = requestSizes.find(
      requestSize => requestSize > documentedVertexBatchLimit,
    );

    if (oversizedRequest != null) {
      throw new Error(
        `ISSUE_19952_REPRODUCED: embedMany sent ${oversizedRequest} input texts in one Vertex :predict request; the documented limit is ${documentedVertexBatchLimit}.`,
        { cause: error },
      );
    }

    throw error;
  }

  if (predictModel.maxEmbeddingsPerCall !== documentedVertexBatchLimit) {
    throw new Error(
      `Expected gemini-embedding-001 to advertise ${documentedVertexBatchLimit}, received ${predictModel.maxEmbeddingsPerCall}.`,
    );
  }

  if (
    requestSizes.length < 2 ||
    requestSizes.some(requestSize => requestSize > documentedVertexBatchLimit)
  ) {
    throw new Error(
      `Expected multiple requests of at most ${documentedVertexBatchLimit} inputs, received ${requestSizes.join(', ')}.`,
    );
  }

  for (const modelId of [
    'gemini-embedding-2',
    'gemini-embedding-2-preview',
  ] as const) {
    const model = vertex.embeddingModel(modelId);

    if (model.maxEmbeddingsPerCall !== 1) {
      throw new Error(
        `Expected ${modelId} to retain a one-value batch limit, received ${model.maxEmbeddingsPerCall}.`,
      );
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
