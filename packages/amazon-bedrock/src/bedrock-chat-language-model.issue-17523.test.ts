import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

vi.mock('./bedrock-event-stream-response-handler', () => ({
  createBedrockEventStreamResponseHandler:
    () =>
    async ({ response }: { response: Response }) => {
      const chunks = (await response.text())
        .split('\n')
        .filter(Boolean)
        .map(chunk => {
          const value = JSON.parse(chunk);
          return { success: true, value, rawValue: value };
        });

      return {
        responseHeaders: Object.fromEntries(response.headers),
        value: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        }),
      };
    },
}));

const prompt: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Say hello' }] },
];
const baseUrl = 'https://bedrock-runtime.eu-west-1.amazonaws.com';
const modelId =
  'arn:aws:bedrock:eu-west-1:474668406012:inference-profile/eu.amazon.nova-lite-v1:0';
const encodedModelId = encodeURIComponent(modelId);

describe('issue #17523', () => {
  it('generates and streams text with ARN slashes encoded', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.endsWith('/converse')) {
        return new Response(
          fs.readFileSync('src/__fixtures__/issue-17523-converse.json', 'utf8'),
          { headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(
        fs.readFileSync(
          'src/__fixtures__/issue-17523-converse-stream.chunks.txt',
          'utf8',
        ),
      );
    });
    const model = new BedrockChatLanguageModel(modelId, {
      baseUrl: () => baseUrl,
      headers: {},
      fetch,
      generateId: () => 'test-id',
    });

    const generated = await model.doGenerate({ prompt });
    const streamed = await model.doStream({
      prompt,
      includeRawChunks: false,
    });
    const streamParts = await convertReadableStreamToArray(streamed.stream);

    expect(generated.content).toContainEqual({
      type: 'text',
      text: 'Hello! How can I assist you today? If',
    });
    expect(streamParts).toContainEqual({
      type: 'text-delta',
      id: '0',
      delta: 'Hello',
    });
    expect(streamParts).toContainEqual(
      expect.objectContaining({
        type: 'finish',
        finishReason: 'length',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/model/${encodedModelId}/converse`,
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/model/${encodedModelId}/converse-stream`,
      expect.any(Object),
    );
  });
});
