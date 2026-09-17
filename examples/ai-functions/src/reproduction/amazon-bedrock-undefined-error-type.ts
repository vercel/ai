import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError } from '@ai-sdk/provider';
import assert from 'node:assert/strict';

const expectedMessage = 'boom';

const bedrock = createAmazonBedrock({
  apiKey: 'test-api-key',
  region: 'us-east-1',
  baseURL: 'https://bedrock.test',
  fetch: async () =>
    new Response(JSON.stringify({ message: expectedMessage }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }),
});

async function getApiErrorMessage(call: () => PromiseLike<unknown>) {
  try {
    await call();
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    return error.message;
  }

  throw new Error('Expected the simulated Bedrock request to fail');
}

async function main() {
  const nonStreamingMessage = await getApiErrorMessage(() =>
    bedrock('test-model').doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    }),
  );

  assert.equal(
    nonStreamingMessage,
    expectedMessage,
    'The non-streaming chat handler is the working comparison',
  );

  const affectedCalls: Array<[string, () => PromiseLike<unknown>]> = [
    [
      'streaming chat',
      () =>
        bedrock('test-model').doStream({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            },
          ],
        }),
    ],
    [
      'embedding',
      () =>
        bedrock
          .embedding('amazon.titan-embed-text-v1')
          .doEmbed({ values: ['Hello'] }),
    ],
    [
      'image',
      () =>
        bedrock.image('amazon.titan-image-generator-v1').doGenerate({
          prompt: 'A test image',
          n: 1,
          size: '512x512',
          aspectRatio: undefined,
          seed: undefined,
          files: undefined,
          mask: undefined,
          providerOptions: {},
        }),
    ],
    [
      'reranking',
      () =>
        bedrock.reranking('amazon.rerank-v1:0').doRerank({
          query: 'Hello',
          documents: { type: 'text', values: ['Hello world'] },
          topN: 1,
        }),
    ],
  ];

  const messages = await Promise.all(
    affectedCalls.map(async ([name, call]) => ({
      name,
      message: await getApiErrorMessage(call),
    })),
  );

  const prefixedHandlers = messages
    .filter(({ message }) => message === `undefined: ${expectedMessage}`)
    .map(({ name }) => name);

  if (prefixedHandlers.length > 0) {
    throw new Error(
      `ISSUE_20926_REPRODUCED: literal "undefined:" prefixes Bedrock API errors for ${prefixedHandlers.join(
        ', ',
      )}`,
    );
  }

  for (const { name, message } of messages) {
    assert.equal(
      message,
      expectedMessage,
      `${name} should preserve the message`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
