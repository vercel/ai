import type { Experimental_BatchV4 as BatchV4 } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { experimental_startBatch as startBatch, jsonSchema, Output } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  let receivedResponseFormat: unknown;

  const provider: BatchV4<{ text: 'mock-model' }> = {
    specificationVersion: 'v4',
    provider: 'mock',
    supportedUrls: {},
    async doStartBatch({ requests }) {
      const request = requests[0];
      receivedResponseFormat =
        request.type === 'text' ? request.options.responseFormat : undefined;

      return {
        batchId: 'batch-1',
        status: 'pending',
        warnings: [],
      };
    },
    async doGetBatchStatus() {
      throw new Error('Not used in this submission example.');
    },
    async doGetBatchResults() {
      throw new Error('Not used in this submission example.');
    },
  };

  const schema = {
    type: 'object' as const,
    properties: {
      count: { type: 'number' as const },
    },
    required: ['count'],
    additionalProperties: false,
  };

  await startBatch({
    provider,
    requests: [
      {
        id: 'count-request',
        type: 'text',
        model: 'mock-model',
        prompt: 'Return the number of items.',
        output: Output.object({
          schema: jsonSchema(schema),
          name: 'count_result',
          description: 'The requested item count.',
        }),
      },
    ],
  });

  assert.deepEqual(receivedResponseFormat, {
    type: 'json',
    schema,
    name: 'count_result',
    description: 'The requested item count.',
  });

  console.log(receivedResponseFormat);
});
