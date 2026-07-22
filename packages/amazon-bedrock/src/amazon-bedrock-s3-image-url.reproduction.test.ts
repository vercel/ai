import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

describe('vercel/ai#15792', () => {
  it('passes an s3 image URL to Bedrock as an s3Location', async () => {
    let requestBody: unknown;
    const responseBody = fs.readFileSync(
      'src/__fixtures__/amazon-bedrock-s3-image-url.json',
      'utf8',
    );

    const model = new AmazonBedrockChatLanguageModel(
      'anthropic.claude-3-haiku-20240307-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        generateId: () => 'test-id',
        fetch: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body));
          return new Response(responseBody, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    );

    await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the image.' },
            {
              type: 'file',
              data: {
                type: 'url',
                url: new URL(
                  's3://ai-sdk-reproduction-15792/path/to/image.png',
                ),
              },
              mediaType: 'image/png',
            },
          ],
        },
      ],
    });

    expect(requestBody).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [
            { text: 'Describe the image.' },
            {
              image: {
                format: 'png',
                source: {
                  s3Location: {
                    uri: 's3://ai-sdk-reproduction-15792/path/to/image.png',
                  },
                },
              },
            },
          ],
        },
      ],
    });
  });
});
