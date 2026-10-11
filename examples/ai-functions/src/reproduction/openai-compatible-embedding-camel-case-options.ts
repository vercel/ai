import assert from 'node:assert/strict';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

type EmbeddingRequest = {
  dimensions?: number;
  user?: string;
};

async function main() {
  const requests: EmbeddingRequest[] = [];

  const provider = createOpenAICompatible({
    name: 'example-provider',
    baseURL: 'https://synthetic.invalid/v1',
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init?.body as string) as EmbeddingRequest);

      return Response.json({
        data: [{ embedding: [0.1, 0.2] }],
        usage: { prompt_tokens: 1 },
      });
    },
  });

  const results = [];
  for (const key of [
    'example-provider',
    'exampleProvider',
    'openaiCompatible',
  ]) {
    results.push(
      await provider.embeddingModel('mock').doEmbed({
        values: ['hello'],
        providerOptions: {
          [key]: { dimensions: 2, user: 'synthetic-user' },
        },
      }),
    );
  }

  assert.equal(requests[0].dimensions, 2);
  assert.equal(requests[0].user, 'synthetic-user');
  assert.deepEqual(results[0].warnings, [
    {
      type: 'deprecated',
      setting: "providerOptions key 'example-provider'",
      message: "Use 'exampleProvider' instead.",
    },
  ]);
  assert.equal(requests[2].dimensions, 2);
  assert.equal(requests[2].user, 'synthetic-user');
  assert.deepEqual(results[1].warnings, []);

  if (requests[1].dimensions !== 2 || requests[1].user !== 'synthetic-user') {
    throw new Error(
      `ISSUE_22966_REPRODUCED: recommended exampleProvider options dropped dimensions or user; request=${JSON.stringify(requests[1])}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
