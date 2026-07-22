import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

describe('vercel/ai#15792', () => {
  it('passes an S3 image URL to Bedrock as an s3Location', async () => {
    let requestBody: unknown;
    const responseBody = fs.readFileSync(
      'src/__fixtures__/amazon-bedrock-s3-image-url.json',
      'utf8',
    );
    const model = new BedrockChatLanguageModel('us.amazon.nova-2-lite-v1:0', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      generateId: () => 'test-id',
      fetch: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(responseBody, {
          status: 400,
          headers: {
            'content-type': 'application/json',
            'x-amzn-errortype': 'ValidationException',
          },
        });
      },
    });

    await expect(
      model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe the image.' },
              {
                type: 'file',
                data: new URL(
                  's3://ai-sdk-reproduction-15792/path/to/image.png',
                ),
                mediaType: 'image/png',
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_APICallError',
      message:
        'The model returned the following errors: Provided S3Location not found',
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
