import assert from 'node:assert/strict';
import type { EmbeddingModelV2 } from '../../../../packages/provider/src';
import { embed } from '../../../../packages/ai/src/embed/embed';
import { MockTracer } from '../../../../packages/ai/src/test/mock-tracer';
import { InvalidResponseDataError } from '../../../../packages/provider/src/errors/invalid-response-data-error';

const FAILURE_SIGNAL =
  'ISSUE_20355_REPRODUCED: embed() resolved with an undefined embedding';

async function main() {
  let providerCalls = 0;
  const tracer = new MockTracer();

  const model: EmbeddingModelV2<string> = {
    specificationVersion: 'v2',
    provider: 'mock-provider',
    modelId: 'empty-embedding-model',
    maxEmbeddingsPerCall: 1,
    supportsParallelCalls: false,
    async doEmbed({ values }) {
      providerCalls++;
      assert.deepEqual(values, ['sunny day at the beach']);

      return {
        embeddings: [],
        usage: { tokens: 5 },
      };
    },
  };

  let result: Awaited<ReturnType<typeof embed<string>>> | undefined;
  let rejection: unknown;

  try {
    result = await embed({
      model,
      value: 'sunny day at the beach',
      experimental_telemetry: {
        isEnabled: true,
        tracer,
      },
    });
  } catch (error) {
    rejection = error;
  }

  assert.equal(providerCalls, 1, 'the provider should be called exactly once');

  if (rejection !== undefined) {
    assert.ok(
      InvalidResponseDataError.isInstance(rejection),
      'an empty provider embedding response should reject with InvalidResponseDataError',
    );
    return;
  }

  assert.ok(result, 'embed() unexpectedly returned no result');

  let downstreamError: unknown;
  try {
    result.embedding.length;
  } catch (error) {
    downstreamError = error;
  }

  console.error(
    JSON.stringify(
      {
        embeddingType: typeof result.embedding,
        providerCalls,
        usage: result.usage,
        telemetry: tracer.spans.map(span => ({
          name: span.name,
          endCalls: span.endCalls,
          eventNames: span.events.map(event => event.name),
          status: span.status,
        })),
        downstreamError:
          downstreamError instanceof Error
            ? `${downstreamError.name}: ${downstreamError.message}`
            : downstreamError,
      },
      null,
      2,
    ),
  );

  assert.fail(FAILURE_SIGNAL);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
