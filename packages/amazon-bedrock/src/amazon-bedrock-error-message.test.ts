import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAmazonBedrock } from './bedrock-provider';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

const liveErrorBody = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/amazon-bedrock-validation-error-no-type.json',
    'utf8',
  ),
);

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

describe('Bedrock error messages', () => {
  it('does not prefix errors with undefined when the body has no type', async () => {
    const provider = createProvider(liveErrorBody);
    const message = liveErrorBody.message;

    const messages = {
      doGenerate: await errorMessage(() =>
        provider('test-model').doGenerate({ prompt }),
      ),
      doStream: await errorMessage(() =>
        provider('test-model').doStream({ prompt }),
      ),
      doEmbed: await errorMessage(() =>
        provider.embedding('amazon.titan-embed-text-v2:0').doEmbed({
          values: ['hello'],
        }),
      ),
      image: await errorMessage(() =>
        provider.image('amazon.nova-canvas-v1:0').doGenerate({
          prompt: 'hello',
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ),
    };

    expect(messages).toEqual({
      doGenerate: message,
      doStream: message,
      doEmbed: message,
      image: message,
    });
  });

  it('preserves a body type when one is present', async () => {
    const provider = createProvider({
      type: 'ValidationException',
      message: 'boom',
    });

    expect(
      await errorMessage(() =>
        provider('test-model').doStream({
          prompt,
        }),
      ),
    ).toBe('ValidationException: boom');
  });
});
