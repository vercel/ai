import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import { readFileSync } from 'node:fs';
import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

type Fixture = {
  trace: {
    converseUsage: Record<string, unknown>;
    converseStreamMetadataUsage: Record<string, unknown>;
  };
  cacheUsage: Record<string, unknown>;
  futureTopLevelMetadata: unknown;
};

const codec = new EventStreamCodec(toUtf8, fromUtf8);
const fixture = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/issue-19686-usage-raw.json', import.meta.url),
    'utf8',
  ),
) as Fixture;
const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Test' }],
  },
];
const generateUsage = {
  ...fixture.trace.converseUsage,
  ...fixture.cacheUsage,
  futureTopLevelMetadata: fixture.futureTopLevelMetadata,
};
const streamUsage = {
  ...fixture.trace.converseStreamMetadataUsage,
  ...fixture.cacheUsage,
  futureTopLevelMetadata: fixture.futureTopLevelMetadata,
};

function createEventFrame(eventType: string, body: unknown): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
      ':content-type': { type: 'string', value: 'application/json' },
    },
    body: fromUtf8(JSON.stringify(body)),
  });
}

function createModel() {
  return new AmazonBedrockChatLanguageModel(
    'anthropic.claude-3-haiku-20240307-v1:0',
    {
      baseUrl: () => 'https://bedrock.example.test',
      headers: {},
      generateId: () => 'id',
      fetch: async input => {
        if (input.toString().endsWith('/converse')) {
          return new Response(
            JSON.stringify({
              output: {
                message: {
                  role: 'assistant',
                  content: [],
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
        }

        const frames = [
          createEventFrame('messageStop', { stopReason: 'end_turn' }),
          createEventFrame('metadata', {
            metrics: { latencyMs: 1 },
            usage: streamUsage,
          }),
        ];

        return new Response(
          new ReadableStream({
            start(controller) {
              for (const frame of frames) {
                controller.enqueue(frame);
              }
              controller.close();
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/vnd.amazon.eventstream',
            },
          },
        );
      },
    },
  );
}

describe('Amazon Bedrock raw usage', () => {
  it('preserves complete Converse usage', async () => {
    const result = await createModel().doGenerate({ prompt });

    expect(result.usage.raw).toEqual(generateUsage);
    expect(result.usage.inputTokens).toEqual({
      total: 18,
      noCache: 13,
      cacheRead: 3,
      cacheWrite: 2,
    });
    expect(result.usage.outputTokens).toEqual({
      total: 4,
      text: 4,
      reasoning: undefined,
    });
  });

  it('preserves complete ConverseStream usage through the event decoder', async () => {
    const { stream } = await createModel().doStream({
      prompt,
      includeRawChunks: false,
    });
    const parts: LanguageModelV4StreamPart[] = [];
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value);
    }

    const finish = parts.find(part => part.type === 'finish');
    expect(finish?.type).toBe('finish');
    if (finish?.type !== 'finish') {
      return;
    }

    expect(finish.usage.raw).toEqual(streamUsage);
    expect(finish.usage.inputTokens).toEqual({
      total: 18,
      noCache: 13,
      cacheRead: 3,
      cacheWrite: 2,
    });
    expect(finish.usage.outputTokens).toEqual({
      total: 5,
      text: 5,
      reasoning: undefined,
    });
  });
});
