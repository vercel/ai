import assert from 'node:assert/strict';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

function createProvider(errorBody: object) {
  return createAmazonBedrock({
    apiKey: 'test-api-key',
    region: 'us-east-1',
    baseURL: 'https://bedrock.test',
    fetch: async () =>
      new Response(JSON.stringify(errorBody), {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'x-amzn-errortype': 'ValidationException',
        },
      }),
  });
}

async function errorMessage(action: () => PromiseLike<unknown>) {
  try {
    await action();
    throw new Error('Expected the Bedrock request to fail.');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function main() {
  const withoutType = createProvider({ message: 'boom' });
  const messages = {
    doGenerate: await errorMessage(() =>
      withoutType('test-model').doGenerate({ prompt }),
    ),
    doStream: await errorMessage(() =>
      withoutType('test-model').doStream({ prompt }),
    ),
    doEmbed: await errorMessage(() =>
      withoutType.embedding('amazon.titan-embed-text-v2:0').doEmbed({
        values: ['hello'],
      }),
    ),
    image: await errorMessage(() =>
      withoutType.image('amazon.nova-canvas-v1:0').doGenerate({
        prompt: 'hello',
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      }),
    ),
  };

  assert.equal(messages.doGenerate, 'boom');

  const typed = createProvider({
    type: 'ValidationException',
    message: 'boom',
  });
  assert.equal(
    await errorMessage(() => typed('test-model').doStream({ prompt })),
    'ValidationException: boom',
  );

  const affected = [messages.doStream, messages.doEmbed, messages.image];
  if (affected.some(message => message !== 'boom')) {
    throw new Error(
      `ISSUE_20926_REPRODUCED: Bedrock errors without a body type must be "boom"; observed ${JSON.stringify(messages)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
