import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAmazonBedrock } from './bedrock-provider';

const providerMessage =
  "This model doesn't support the image field for user messages. Remove image and try again.";
const responseBody = readFileSync(
  'src/__fixtures__/amazon-bedrock-validation-error-no-type.json',
  'utf8',
);

const bedrock = createAmazonBedrock({
  apiKey: 'test-api-key',
  region: 'us-east-1',
  fetch: async () =>
    new Response(responseBody, {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'x-amzn-errortype':
          'ValidationException:http://internal.amazon.com/coral/com.amazon.bedrock/',
      },
    }),
});

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

async function getErrorMessage(call: () => PromiseLike<unknown>) {
  try {
    await call();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return (error as Error).message;
  }

  throw new Error('Expected the Bedrock request to reject');
}

describe('Bedrock API errors without a body type', () => {
  it('preserves the message in the non-streaming chat handler', async () => {
    await expect(
      getErrorMessage(() =>
        bedrock('global.openai.gpt-6-astra').doGenerate({ prompt }),
      ),
    ).resolves.toBe(providerMessage);
  });

  it.each([
    {
      name: 'streaming chat',
      call: () => bedrock('global.openai.gpt-6-astra').doStream({ prompt }),
    },
    {
      name: 'embedding',
      call: () =>
        bedrock.embedding('amazon.titan-embed-text-v2:0').doEmbed({
          values: ['sunny day at the beach'],
        }),
    },
    {
      name: 'image',
      call: () =>
        bedrock.image('amazon.nova-canvas-v1:0').doGenerate({
          prompt: 'A sunny day at the beach',
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          files: undefined,
          mask: undefined,
          providerOptions: {},
        }),
    },
    {
      name: 'reranking',
      call: () =>
        bedrock.reranking('cohere.rerank-v3-5:0').doRerank({
          documents: {
            type: 'text',
            values: ['sunny day at the beach'],
          },
          query: 'sunny beach',
          topN: 1,
        }),
    },
  ])('preserves the message in the $name handler', async ({ call }) => {
    await expect(getErrorMessage(call)).resolves.toBe(providerMessage);
  });
});
