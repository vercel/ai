import { createGateway } from '@ai-sdk/gateway';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { embedMany } from './embed-many';

const vertexBatchLimitError = JSON.parse(
  readFileSync(
    new URL(
      '../../../gateway/src/__fixtures__/issue-19950-vertex-batch-limit-error.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('Gateway embedding batch limits', () => {
  it('splits ZDR requests at the Vertex 250-input limit', async () => {
    const requestSizes: number[] = [];
    const gateway = createGateway({
      apiKey: 'test-api-key',
      baseURL: 'https://gateway.test',
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          values: string[];
          providerOptions?: {
            gateway?: {
              zeroDataRetention?: boolean;
            };
          };
        };

        requestSizes.push(body.values.length);
        expect(body.providerOptions?.gateway?.zeroDataRetention).toBe(true);

        if (body.values.length > 250) {
          return new Response(JSON.stringify(vertexBatchLimitError), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({
            embeddings: body.values.map(() => [0]),
            usage: { tokens: body.values.length },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    });

    const result = await embedMany({
      model: gateway.embeddingModel('google/gemini-embedding-001'),
      values: Array.from(
        { length: 251 },
        (_, index) => `Synthetic embedding boundary probe ${index}`,
      ),
      maxRetries: 0,
      providerOptions: {
        gateway: {
          zeroDataRetention: true,
        },
      },
    });

    expect(result.embeddings).toHaveLength(251);
    expect(requestSizes).toStrictEqual([250, 1]);
  });
});
