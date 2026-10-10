import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { embedMany, InvalidArgumentError } from 'ai';
import assert from 'node:assert/strict';

class ReproducedBugError extends Error {}

async function main() {
  let calls = 0;

  const model: EmbeddingModelV4 = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    maxEmbeddingsPerCall: 1,
    supportsParallelCalls: true,
    async doEmbed({ values }) {
      calls++;
      return {
        embeddings: values.map(() => [1]),
        warnings: [],
        usage: { tokens: 1 },
      };
    },
  };

  try {
    const result = await embedMany({
      model,
      values: ['first', 'second'],
      maxParallelCalls: Number('invalid configuration'),
    });

    if (
      calls === 0 &&
      result.values.length === 2 &&
      result.embeddings.length === 0
    ) {
      throw new ReproducedBugError(
        'ISSUE_22626_REPRODUCED: embedMany resolved successfully for 2 nonempty values with 0 embeddings and 0 model calls',
      );
    }

    assert.fail(
      `embedMany resolved instead of rejecting invalid maxParallelCalls (calls=${calls}, values=${result.values.length}, embeddings=${result.embeddings.length})`,
    );
  } catch (error) {
    if (error instanceof ReproducedBugError) {
      throw error;
    }

    assert.equal(
      calls,
      0,
      'invalid maxParallelCalls must be rejected before any model call',
    );
    assert.ok(
      InvalidArgumentError.isInstance(error),
      'invalid maxParallelCalls must reject with InvalidArgumentError',
    );
  }
}

main();
