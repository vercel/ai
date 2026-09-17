import { APICallError } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAmazonBedrock } from './amazon-bedrock-provider';

const errorBody = fs.readFileSync(
  new URL(
    './__fixtures__/amazon-bedrock-validation-error-no-type.json',
    import.meta.url,
  ),
  'utf8',
);
const expectedMessage =
  "This model doesn't support the image field for user messages. Remove image and try again.";

const bedrock = createAmazonBedrock({
  apiKey: 'test-api-key',
  region: 'us-east-1',
  baseURL: 'https://bedrock.test',
  fetch: async () =>
    new Response(errorBody, {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'x-amzn-errortype':
          'ValidationException:http://internal.amazon.com/coral/com.amazon.bedrock/',
      },
    }),
});

async function getApiErrorMessage(call: () => PromiseLike<unknown>) {
  try {
    await call();
  } catch (error) {
    expect(APICallError.isInstance(error)).toBe(true);
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    return error.message;
  }

  throw new Error('Expected the simulated Bedrock request to fail');
}

describe('Bedrock error bodies without a type field', () => {
  it('keeps the non-streaming chat error message free of an undefined prefix', async () => {
    expect(
      await getApiErrorMessage(() =>
        bedrock('test-model').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            },
          ],
        }),
      ),
    ).toBe(expectedMessage);
  });

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

  it.each(affectedCalls)(
    '%s preserves the provider message without an undefined prefix',
    async (_name, call) => {
      expect(await getApiErrorMessage(call)).toBe(expectedMessage);
    },
  );
});
