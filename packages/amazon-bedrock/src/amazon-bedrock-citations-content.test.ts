import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const fixture = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/anthropic-citations-content.json', import.meta.url),
    'utf8',
  ),
);

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'What is the title of this document?',
      },
      {
        type: 'file',
        data: {
          type: 'data',
          data: Buffer.from('AI').toString('base64'),
        },
        mediaType: 'text/plain',
        filename: 'ai.txt',
        providerOptions: {
          bedrock: {
            citations: { enabled: true },
          },
        },
      },
    ],
  },
];

describe('AmazonBedrockChatLanguageModel citations content', () => {
  it('returns generated text from a CitationsContentBlock', async () => {
    const model = new AmazonBedrockChatLanguageModel(
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        generateId: () => 'test-id',
        fetch: async () => {
          return new Response(JSON.stringify(fixture), {
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    );

    const result = await model.doGenerate({
      prompt,
      includeRawChunks: false,
    });

    expect(
      result.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join(''),
    ).toBe('AI');
  });
});
