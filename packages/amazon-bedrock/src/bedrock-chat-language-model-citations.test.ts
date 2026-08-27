import {
  TypeValidationError,
  type LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

function createEvent(eventType: string, value: unknown): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
    },
    body: fromUtf8(JSON.stringify(value)),
  });
}

function createStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('Bedrock streaming document citations', () => {
  it('accepts citation deltas returned by Bedrock', async () => {
    const fixtureChunks = fs
      .readFileSync(
        'src/__fixtures__/bedrock-document-citations.chunks.txt',
        'utf8',
      )
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>);
    const citationDeltaCount = fixtureChunks.filter(chunk =>
      JSON.stringify(chunk).includes('"citation"'),
    ).length;

    expect(citationDeltaCount).toBeGreaterThan(0);

    const model = new BedrockChatLanguageModel(
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: async () =>
          new Response(
            createStream(
              fixtureChunks.map(chunk => {
                const [[eventType, value]] = Object.entries(chunk);
                return createEvent(eventType, value);
              }),
            ),
            {
              status: 200,
              headers: {
                'content-type': 'application/vnd.amazon.eventstream',
              },
            },
          ),
        generateId: () => 'test-id',
      },
    );
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is generative AI? Cite the supplied document.',
          },
          {
            type: 'file',
            data: 'AQID',
            mediaType: 'application/pdf',
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
