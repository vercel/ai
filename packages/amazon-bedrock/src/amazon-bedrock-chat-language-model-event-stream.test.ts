import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createEvent(eventType: string, data: string): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
    },
    body: fromUtf8(data),
  });
}

function createStream(
  chunks: Uint8Array[],
): ReadableStream<Uint8Array<ArrayBufferLike>> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createFixtureEvents(filename: string): Uint8Array[] {
  return fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const event = JSON.parse(line) as Record<string, unknown>;
      const [eventType, data] = Object.entries(event)[0];
      return createEvent(eventType, JSON.stringify(data));
    });
}

describe('AmazonBedrockChatLanguageModel doStream', () => {
  it('surfaces documented redactedContent reasoning without an error and preserves the tool call', async () => {
    const model = new AmazonBedrockChatLanguageModel('us.openai.gpt-5.6-luna', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: async () =>
        new Response(
          createStream(createFixtureEvents('amazon-bedrock-redacted-content')),
          {
            status: 200,
            headers: {
              'content-type': 'application/vnd.amazon.eventstream',
            },
          },
        ),
      generateId: () => 'test-id',
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);

    expect(parts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'error' })]),
    );
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-call',
          toolCallId: 'call_75be1097e9375c5aaa95a748e208be0e',
          toolName: 'propose',
          input:
            '{"groups":[{"name":"Sales","parentGroupName":""},{"name":"Team1","parentGroupName":"Sales"}]}',
        }),
      ]),
    );
    expect(JSON.stringify(parts)).toContain('"redactedContent"');
  });

  it('surfaces event stream decoding failures', async () => {
    const corruptedFrame = createEvent('contentBlockDelta', 'corrupted');
    corruptedFrame[corruptedFrame.length - 1] ^= 0xff;

    const model = new AmazonBedrockChatLanguageModel(
      'anthropic.claude-3-haiku-20240307-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: async () =>
          new Response(
            createStream([
              corruptedFrame,
              createEvent(
                'contentBlockDelta',
                JSON.stringify({
                  contentBlockIndex: 0,
                  delta: { text: 'later' },
                }),
              ),
            ]),
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

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toThrow(
      'The message checksum',
    );
  });

  it('rejects a truncated event stream frame at EOF', async () => {
    const textFrame = createEvent(
      'contentBlockDelta',
      JSON.stringify({
        contentBlockIndex: 0,
        delta: { text: 'partial result' },
      }),
    );
    const messageStopFrame = createEvent(
      'messageStop',
      JSON.stringify({
        stopReason: 'end_turn',
      }),
    );

    const model = new AmazonBedrockChatLanguageModel(
      'anthropic.claude-3-haiku-20240307-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: async () =>
          new Response(
            createStream([textFrame, messageStopFrame.subarray(0, -1)]),
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

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    await expect(convertReadableStreamToArray(stream)).rejects.toThrow(
      'Incomplete Amazon Bedrock event-stream frame',
    );
  });

  it('allows EOF at a complete frame boundary without messageStop', async () => {
    const model = new AmazonBedrockChatLanguageModel(
      'anthropic.claude-3-haiku-20240307-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: async () =>
          new Response(
            createStream([
              createEvent(
                'contentBlockDelta',
                JSON.stringify({
                  contentBlockIndex: 0,
                  delta: { text: 'complete frame' },
                }),
              ),
            ]),
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

    const { stream } = await model.doStream({
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
          finishReason: { unified: 'other' },
        }),
      ]),
    );
  });
});
