import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const fixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/issue-19686-usage-raw.json', 'utf8'),
);
const usage = fixture.deterministicUsage;
const codec = new EventStreamCodec(toUtf8, fromUtf8);
const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createEvent(eventType: string, value: unknown): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
    },
    body: fromUtf8(JSON.stringify(value)),
  });
}

function createModel({
  generateUsage = usage,
  streamUsage = usage,
}: {
  generateUsage?: unknown;
  streamUsage?: unknown;
} = {}) {
  return new BedrockChatLanguageModel(
    'anthropic.claude-3-haiku-20240307-v1:0',
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: async input => {
        if (String(input).endsWith('/converse-stream')) {
          const body = new ReadableStream({
            start(controller) {
              controller.enqueue(
                createEvent('messageStop', { stopReason: 'end_turn' }),
              );
              controller.enqueue(
                createEvent('metadata', { usage: streamUsage }),
              );
              controller.close();
            },
          });

          return new Response(body, {
            status: 200,
            headers: {
              'content-type': 'application/vnd.amazon.eventstream',
            },
          });
        }

        return new Response(
          JSON.stringify({
            output: {
              message: {
                role: 'assistant',
                content: [{ text: 'Hello!' }],
              },
            },
            stopReason: 'end_turn',
            usage: generateUsage,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
      generateId: () => 'test-id',
    },
  );
}

describe('Amazon Bedrock complete raw usage preservation', () => {
  it('preserves provider-shaped Converse usage.raw', async () => {
    const result = await createModel().doGenerate({ prompt });

    expect(result.usage.raw).toStrictEqual(usage);
    expect(result.usage.inputTokens).toStrictEqual({
      total: 54,
      noCache: 47,
      cacheRead: 3,
      cacheWrite: 4,
    });
    expect(result.usage.outputTokens).toStrictEqual({
      total: 20,
      text: 20,
      reasoning: undefined,
    });
  });

  it('preserves provider-shaped ConverseStream usage.raw through the real event-stream decoder', async () => {
    const { stream } = await createModel().doStream({
      prompt,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);
    const finish = parts.find(part => part.type === 'finish');

    expect(finish?.usage.raw).toStrictEqual(usage);
    expect(finish?.usage.inputTokens).toStrictEqual({
      total: 54,
      noCache: 47,
      cacheRead: 3,
      cacheWrite: 4,
    });
    expect(finish?.usage.outputTokens).toStrictEqual({
      total: 20,
      text: 20,
      reasoning: undefined,
    });
  });

  it('continues to validate known Converse usage fields', async () => {
    await expect(
      createModel({
        generateUsage: { ...usage, inputTokens: '47' },
      }).doGenerate({ prompt }),
    ).rejects.toThrow();
  });

  it('continues to validate known ConverseStream cache-detail fields', async () => {
    const { stream } = await createModel({
      streamUsage: {
        ...usage,
        cacheDetails: [{ ...usage.cacheDetails[0], inputTokens: '4' }],
      },
    }).doStream({
      prompt,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);

    expect(parts.some(part => part.type === 'error')).toBe(true);
  });
});
