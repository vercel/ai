import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const expectedRequest = JSON.parse(
  fs.readFileSync('src/__fixtures__/amazon-bedrock-s3-image-url.json', 'utf8'),
);

describe('issue #15792: Amazon Bedrock S3 image URLs', () => {
  it('sends an S3 image as image.source.s3Location', async () => {
    let requestBody: unknown;

    const model = new BedrockChatLanguageModel(
      'anthropic.claude-3-haiku-20240307-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        generateId: () => 'test-id',
        fetch: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body));

          return new Response(
            JSON.stringify({
              output: {
                message: {
                  role: 'assistant',
                  content: [{ text: 'The image contains a cat.' }],
                },
              },
              stopReason: 'end_turn',
              usage: {
                inputTokens: 10,
                outputTokens: 6,
                totalTokens: 16,
              },
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            },
          );
        },
      },
    );

    await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image.' },
            {
              type: 'file',
              data: new URL('s3://amzn-s3-demo-bucket/myImage.png'),
              mediaType: 'image/png',
            },
          ],
        },
      ],
    });

    expect(requestBody).toStrictEqual(expectedRequest);
  });
});
