import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

<<<<<<< HEAD
function createEvent(
  data: string,
  eventType = 'contentBlockDelta',
): Uint8Array {
=======
function createEvent(eventType: string, data: string): Uint8Array {
>>>>>>> origin/release-v6.0
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

describe('BedrockChatLanguageModel doStream', () => {
  it('surfaces event stream decoding failures', async () => {
    const corruptedFrame = createEvent('contentBlockDelta', 'corrupted');
    corruptedFrame[corruptedFrame.length - 1] ^= 0xff;

    const model = new BedrockChatLanguageModel(
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

<<<<<<< HEAD
  it('accepts documented redactedContent from a recorded Converse stream', async () => {
    const fixture = fs
      .readFileSync(
        'src/__fixtures__/amazon-bedrock-redacted-content.chunks.txt',
        'utf8',
      )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    const redactedContent =
      fixture[1].contentBlockDelta.delta.reasoningContent.redactedContent;
    const events = fixture.map(event => {
      const eventType = Object.keys(event)[0];
      return createEvent(JSON.stringify(event[eventType]), eventType);
    });

    const model = new BedrockChatLanguageModel('us.openai.gpt-5.6-luna', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: async () =>
        new Response(createStream(events), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        }),
      generateId: () => 'test-id',
    });
=======
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

    const model = new BedrockChatLanguageModel(
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
>>>>>>> origin/release-v6.0

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });
<<<<<<< HEAD
    const parts = await convertReadableStreamToArray(stream);

    expect(parts.find(part => part.type === 'error')).toBeUndefined();
    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call_61f8fcbe423a58699163c53e076f1a06',
      toolName: 'propose',
      input: JSON.stringify({
        groups: [
          { name: 'Sales', parentGroupName: '' },
          { name: 'Team1', parentGroupName: 'Sales' },
        ],
      }),
    });
    expect(JSON.stringify(parts)).toContain(redactedContent);
=======

    await expect(convertReadableStreamToArray(stream)).rejects.toThrow(
      'Incomplete Amazon Bedrock event-stream frame',
    );
  });

  it('allows EOF at a complete frame boundary without messageStop', async () => {
    const model = new BedrockChatLanguageModel(
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
>>>>>>> origin/release-v6.0
  });
});
