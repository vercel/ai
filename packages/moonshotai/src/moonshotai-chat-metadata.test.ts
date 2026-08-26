import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Use get_weather.' }] },
];

const provider = createMoonshotAI({ apiKey: 'test-api-key' });
const server = createTestServer({
  'https://api.moonshot.ai/v1/chat/completions': {},
});

const jsonFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/moonshotai-metadata-live.json', 'utf8'),
);

function prepareJsonResponse(body: any = jsonFixture) {
  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'json-value',
    body,
  };
}

function prepareStreamResponse(filename = 'moonshotai-metadata-live') {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'stream-chunks',
    chunks,
  };
}

describe('Moonshot chat response metadata', () => {
  it('preserves generate metadata from the recorded Moonshot response', async () => {
    prepareJsonResponse();

    const result = await provider.chatModel('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata?.moonshotai).toStrictEqual({
      responseObject: 'chat.completion',
      choiceIndex: 0,
      messageRole: 'assistant',
      toolCallTypes: ['function'],
    });
  });

  it('preserves stream finish metadata from the recorded Moonshot chunks', async () => {
    prepareStreamResponse();

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
    });
    const parts = await convertReadableStreamToArray(result.stream);
    const finish = parts.find(part => part.type === 'finish');

    expect(finish?.type).toBe('finish');
    if (finish?.type === 'finish') {
      expect(finish.providerMetadata?.moonshotai).toStrictEqual({
        responseObject: 'chat.completion.chunk',
        choiceIndex: 0,
        messageRole: 'assistant',
        toolCallTypes: ['function'],
      });
    }
  });

  it('keeps unified tool calls and the raw generate response unchanged', async () => {
    prepareJsonResponse();

    const result = await provider.chatModel('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toContainEqual({
      type: 'tool-call',
      toolCallId: 'get_weather_0',
      toolName: 'get_weather',
      input: '{"city": "Paris"}',
    });
    expect(result.response?.body).toStrictEqual(jsonFixture);
  });

  it('keeps raw stream chunks and unified tool calls unchanged', async () => {
    prepareStreamResponse();

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });
    const parts = await convertReadableStreamToArray(result.stream);
    const rawChunks = parts
      .filter(part => part.type === 'raw')
      .map(part => part.rawValue as any);

    expect(
      rawChunks.some(chunk => chunk.object === 'chat.completion.chunk'),
    ).toBe(true);
    expect(
      rawChunks.some(chunk =>
        chunk.choices?.some((choice: any) =>
          choice.delta?.tool_calls?.some(
            (toolCall: any) => toolCall.type === 'function',
          ),
        ),
      ),
    ).toBe(true);
    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'get_weather_0',
      toolName: 'get_weather',
      input: '{"city": "Paris"}',
    });
  });

  it('handles missing and null generate metadata fields safely', async () => {
    prepareJsonResponse({
      id: 'chatcmpl-null-metadata',
      object: null,
      created: 1787762060,
      model: 'kimi-k3',
      choices: [
        {
          index: null,
          message: {
            role: null,
            content: 'Hello',
            tool_calls: null,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    });

    const result = await provider.chatModel('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toStrictEqual([{ type: 'text', text: 'Hello' }]);
    expect(result.providerMetadata?.moonshotai).toStrictEqual({});
  });

  it('handles missing and null stream metadata fields safely', async () => {
    server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        'data: {"id":"chatcmpl-null-metadata","object":null,"created":1787762071,"model":"kimi-k3","choices":[{"index":null,"delta":{"role":null,"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-null-metadata","created":1787762071,"model":"kimi-k3","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ],
    };

    const result = await provider.chatModel('kimi-k3').doStream({
      prompt: TEST_PROMPT,
    });
    const parts = await convertReadableStreamToArray(result.stream);
    const finish = parts.find(part => part.type === 'finish');

    expect(parts).toContainEqual({
      type: 'text-delta',
      id: 'txt-0',
      delta: 'Hello',
    });
    expect(finish?.type).toBe('finish');
    if (finish?.type === 'finish') {
      expect(finish.providerMetadata?.moonshotai).toStrictEqual({});
    }
  });
});
