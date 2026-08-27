import {
  TypeValidationError,
  type LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

function createEvent(eventType: string, data: unknown): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
    },
    body: fromUtf8(JSON.stringify(data)),
  });
}

describe('Bedrock streaming document citations', () => {
  it('accepts citation deltas returned by Bedrock', async () => {
    const chunks = fs
      .readFileSync(
        'src/__fixtures__/issue-9101-bedrock-document-citations.chunks.txt',
        'utf8',
      )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>);

    const citationDeltaCount = chunks.filter(chunk =>
      JSON.stringify(chunk).includes('"citation"'),
    ).length;

    const model = new BedrockChatLanguageModel(
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (const chunk of chunks) {
                  const [eventType, data] = Object.entries(chunk)[0];
                  controller.enqueue(createEvent(eventType, data));
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
          ),
        generateId: () => 'test-id',
      },
    );

    const prompt: LanguageModelV3Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is generative AI? Cite the supplied document.',
          },
          {
            type: 'file',
            data: new Uint8Array([1, 2, 3]),
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
    const citationValidationErrors = parts.filter(part => {
      if (
        part.type !== 'error' ||
        !TypeValidationError.isInstance(part.error)
      ) {
        return false;
      }

      return JSON.stringify(part.error.value).includes('"citation"');
    });

    expect(citationDeltaCount).toBe(6);
    expect(citationValidationErrors).toHaveLength(0);
  });
});
