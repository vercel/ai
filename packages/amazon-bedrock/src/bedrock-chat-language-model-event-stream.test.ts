import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

const TEST_PROMPT: LanguageModelV2Prompt = [
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

function createModel(responseChunks: Uint8Array[]) {
  return new BedrockChatLanguageModel(
    'anthropic.claude-3-haiku-20240307-v1:0',
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: async () =>
        new Response(createStream(responseChunks), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        }),
      generateId: () => 'test-id',
    },
  );
}

describe('BedrockChatLanguageModel doStream event stream handling', () => {
  it('surfaces a modeled exception frame as an error part and error finish', async () => {
    const fixture = readFileSync(
      new URL(
        './__fixtures__/model-stream-error-exception.eventstream.base64.txt',
        import.meta.url,
      ),
      'utf8',
    ).trim();

    const { stream } = await createModel([
      new Uint8Array(Buffer.from(fixture, 'base64')),
    ]).doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          delta: 'before error',
        }),
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({
            message: 'Model Stream Error',
          }),
        }),
        expect.objectContaining({
          type: 'finish',
          finishReason: 'error',
        }),
      ]),
    );
  });

  it('surfaces event stream decoding failures', async () => {
    const corruptedFrame = createEvent('contentBlockDelta', {
      contentBlockIndex: 0,
      delta: { text: 'corrupted' },
    });
    corruptedFrame[corruptedFrame.length - 1] ^= 0xff;

    const { stream } = await createModel([
      corruptedFrame,
      createEvent('contentBlockDelta', {
        contentBlockIndex: 0,
        delta: { text: 'later' },
      }),
    ]).doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toThrow(
      'The message checksum',
    );
  });

  it('rejects a truncated event stream frame at EOF', async () => {
    const textFrame = createEvent('contentBlockDelta', {
      contentBlockIndex: 0,
      delta: { text: 'partial result' },
    });
    const messageStopFrame = createEvent('messageStop', {
      stopReason: 'end_turn',
    });

    const { stream } = await createModel([
      textFrame,
      messageStopFrame.subarray(0, -1),
    ]).doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toThrow(
      'Incomplete Amazon Bedrock event-stream frame',
    );
  });

  it('allows EOF at a complete frame boundary without messageStop', async () => {
    const { stream } = await createModel([
      createEvent('contentBlockDelta', {
        contentBlockIndex: 0,
        delta: { text: 'complete frame' },
      }),
    ]).doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    await expect(convertReadableStreamToArray(stream)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text-delta',
          delta: 'complete frame',
        }),
        expect.objectContaining({
          type: 'finish',
          finishReason: 'unknown',
        }),
      ]),
    );
  });
});
