import {
  TypeValidationError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

vi.mock('./amazon-bedrock-event-stream-response-handler', () => ({
  createAmazonBedrockEventStreamResponseHandler:
    (schema: any) =>
    async ({ response }: { response: Response }) => {
      const chunks = (await response.text())
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));

      return {
        responseHeaders: {},
        value: new ReadableStream({
          async start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(
                await safeValidateTypes({
                  value: chunk,
                  schema,
                }),
              );
            }
            controller.close();
          },
        }),
      };
    },
}));

describe('Bedrock streaming document citations', () => {
  it('accepts citation deltas returned by Bedrock', async () => {
    const fixture = fs.readFileSync(
      'src/__fixtures__/amazon-bedrock-document-citations.chunks.txt',
      'utf8',
    );
    const model = new AmazonBedrockChatLanguageModel(
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: async () => new Response(fixture),
        generateId: () => 'test-id',
      },
    );
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is generative AI? Cite the supplied document.',
          },
          {
            type: 'file',
            data: {
              type: 'data',
              data: 'AQID',
            },
            mediaType: 'application/pdf',
            filename: 'document.pdf',
            providerOptions: {
              bedrock: {
                citations: { enabled: true },
              },
            },
          },
        ],
      },
    ];

    const { stream } = await model.doStream({
      prompt,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);
    const citationValidationErrors = parts.filter(
      part =>
        part.type === 'error' &&
        TypeValidationError.isInstance(part.error) &&
        JSON.stringify(part.error.value).includes('"citation"'),
    );

    expect(citationValidationErrors).toHaveLength(0);
  });
});
