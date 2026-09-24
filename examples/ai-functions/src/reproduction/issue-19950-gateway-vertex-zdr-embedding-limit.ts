import { GatewayInternalServerError } from '@ai-sdk/gateway';
import { parseJSON } from '@ai-sdk/provider-utils';
import { createGateway, embedMany } from 'ai';

const vertexLimit = 250;
const failingValueCount = vertexLimit + 1;

async function main() {
  const requestSizes: number[] = [];
  const gateway = createGateway({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        const body = (await parseJSON({ text: init.body })) as {
          values?: unknown;
        };

        if (Array.isArray(body.values)) {
          requestSizes.push(body.values.length);
        }
      }

      return fetch(input, init);
    },
  });
  const model = gateway.embeddingModel('google/gemini-embedding-001');
  const providerOptions = {
    gateway: {
      zeroDataRetention: true,
    },
    google: {
      outputDimensionality: 1,
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  };

  const baseline = await embedMany({
    model,
    values: Array.from(
      { length: vertexLimit },
      (_, index) => `Synthetic embedding boundary baseline ${index}`,
    ),
    maxRetries: 0,
    providerOptions,
  });

  if (baseline.embeddings.length !== vertexLimit) {
    throw new Error(
      `Expected ${vertexLimit} baseline embeddings, received ${baseline.embeddings.length}.`,
    );
  }

  const baselineRequestSizes = requestSizes.splice(0);

  try {
    const result = await embedMany({
      model,
      values: Array.from(
        { length: failingValueCount },
        (_, index) => `Synthetic embedding boundary probe ${index}`,
      ),
      maxRetries: 0,
      providerOptions,
    });

    if (result.embeddings.length !== failingValueCount) {
      throw new Error(
        `Expected ${failingValueCount} embeddings, received ${result.embeddings.length}.`,
      );
    }

    const oversizedRequest = requestSizes.find(size => size > vertexLimit);
    if (oversizedRequest != null) {
      throw new Error(
        `Expected Gateway embedding requests to contain at most ${vertexLimit} values, but observed ${oversizedRequest}.`,
      );
    }
  } catch (error) {
    if (
      !GatewayInternalServerError.isInstance(error) ||
      error.statusCode !== 400 ||
      !error.message.includes(`batchSize value of ${failingValueCount}`) ||
      !error.message.includes(
        'supported range is from 1 (inclusive) to 251 (exclusive)',
      )
    ) {
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          advertisedMaxEmbeddingsPerCall: model.maxEmbeddingsPerCall,
          baselineEmbeddingCount: baseline.embeddings.length,
          baselineRequestSizes,
          failingValueCount,
          failingRequestSizes: requestSizes,
          statusCode: error.statusCode,
          message: error.message,
          baselineGatewayMetadata: baseline.providerMetadata?.gateway,
        },
        null,
        2,
      ),
    );

    throw new Error(
      'Reproduced issue #19950: a 251-value ZDR embedding call was sent to Vertex as one oversized request and failed with HTTP 400 instead of being split at the documented 250-input limit.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
