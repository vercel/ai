import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { isProviderStreamError } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
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

describe('AmazonBedrockChatLanguageModel doStream', () => {
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

  it.each([
    {
      exceptionType: 'internalServerException',
      statusCode: 500,
      isRetryable: true,
    },
    {
      exceptionType: 'modelStreamErrorException',
      statusCode: 424,
      isRetryable: true,
    },
    {
      exceptionType: 'serviceUnavailableException',
      statusCode: 503,
      isRetryable: true,
    },
    {
      exceptionType: 'throttlingException',
      statusCode: 429,
      isRetryable: true,
    },
    {
      exceptionType: 'validationException',
      statusCode: 400,
      isRetryable: false,
    },
  ])('surfaces $exceptionType frames as stream errors', async testCase => {
    const { exceptionType, statusCode, isRetryable } = testCase;
    const exception = {
      message: `Modeled exception: ${exceptionType}`,
    };
    const exceptionFrame = codec.encode({
      headers: {
        ':message-type': { type: 'string', value: 'exception' },
        ':exception-type': {
          type: 'string',
          value: exceptionType,
        },
        ':content-type': { type: 'string', value: 'application/json' },
      },
      body: fromUtf8(JSON.stringify(exception)),
    });
    const model = new AmazonBedrockChatLanguageModel(
      'anthropic.claude-3-haiku-20240307-v1:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: async () =>
          new Response(createStream([exceptionFrame]), {
            status: 200,
            headers: {
              'content-type': 'application/vnd.amazon.eventstream',
            },
          }),
        generateId: () => 'test-id',
      },
    );

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);
    const errorPart = parts.at(-2);

    expect(errorPart?.type).toBe('error');
    if (errorPart?.type !== 'error') {
      expect.fail('Expected an error part');
    }
    expect(isProviderStreamError(errorPart.error)).toBe(true);
    expect(errorPart.error).toMatchObject({
      message: exception.message,
      type: exceptionType,
      statusCode,
      isRetryable,
      data: { [exceptionType]: exception },
    });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'error' },
    });
  });

  it('streams reasoning redacted as `redactedContent` for replay', async () => {
    // `redactedContent` is a member of the ReasoningContentBlockDelta union in
    // the Converse API. OpenAI models on Bedrock (e.g. `us.openai.gpt-5.6-luna`)
    // stream their encrypted reasoning in this shape. Deltas are accumulated and
    // attached once via `reasoning-end`, because the merged provider metadata of
    // a reasoning part is last-write-wins.
    const model = new AmazonBedrockChatLanguageModel('us.openai.gpt-5.6-luna', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: async () =>
        new Response(
          createStream([
            createEvent(
              'contentBlockDelta',
              JSON.stringify({
                contentBlockIndex: 0,
                delta: {
                  reasoningContent: {
                    redactedContent: 'encrypted-reasoning-',
                  },
                },
              }),
            ),
            createEvent(
              'contentBlockDelta',
              JSON.stringify({
                contentBlockIndex: 0,
                delta: {
                  reasoningContent: {
                    redactedContent: 'payload',
                  },
                },
              }),
            ),
            createEvent(
              'contentBlockStop',
              JSON.stringify({ contentBlockIndex: 0 }),
            ),
            createEvent(
              'contentBlockDelta',
              JSON.stringify({
                contentBlockIndex: 1,
                delta: { text: 'The answer is 42.' },
              }),
            ),
            createEvent(
              'contentBlockStop',
              JSON.stringify({ contentBlockIndex: 1 }),
            ),
            createEvent(
              'messageStop',
              JSON.stringify({ stopReason: 'end_turn' }),
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
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const parts = await convertReadableStreamToArray(stream);

    expect(parts.filter(part => part.type === 'error')).toStrictEqual([]);
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning-start',
          id: '0',
        }),
        expect.objectContaining({
          type: 'reasoning-end',
          id: '0',
          providerMetadata: {
            amazonBedrock: {
              redactedContent: 'encrypted-reasoning-payload',
            },
            bedrock: {
              redactedContent: 'encrypted-reasoning-payload',
            },
          },
        }),
        expect.objectContaining({
          type: 'text-delta',
          delta: 'The answer is 42.',
        }),
      ]),
    );
  });

  it('keeps multiple redacted reasoning blocks separate', async () => {
    // OpenAI models on Bedrock can return several redacted reasoning blocks in
    // a single response. Each block must surface its own payload.
    const model = new AmazonBedrockChatLanguageModel('us.openai.gpt-5.6-luna', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: async () =>
        new Response(
          createStream([
            createEvent(
              'contentBlockDelta',
              JSON.stringify({
                contentBlockIndex: 0,
                delta: {
                  reasoningContent: { redactedContent: 'first-payload' },
                },
              }),
            ),
            createEvent(
              'contentBlockStop',
              JSON.stringify({ contentBlockIndex: 0 }),
            ),
            createEvent(
              'contentBlockDelta',
              JSON.stringify({
                contentBlockIndex: 1,
                delta: {
                  reasoningContent: { redactedContent: 'second-payload' },
                },
              }),
            ),
            createEvent(
              'contentBlockStop',
              JSON.stringify({ contentBlockIndex: 1 }),
            ),
            createEvent(
              'contentBlockDelta',
              JSON.stringify({
                contentBlockIndex: 2,
                delta: { text: 'The answer is 42.' },
              }),
            ),
            createEvent(
              'contentBlockStop',
              JSON.stringify({ contentBlockIndex: 2 }),
            ),
            createEvent(
              'messageStop',
              JSON.stringify({ stopReason: 'end_turn' }),
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
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const parts = await convertReadableStreamToArray(stream);

    expect(parts.filter(part => part.type === 'error')).toStrictEqual([]);
    expect(parts.filter(part => part.type === 'reasoning-end')).toStrictEqual([
      {
        type: 'reasoning-end',
        id: '0',
        providerMetadata: {
          amazonBedrock: { redactedContent: 'first-payload' },
          bedrock: { redactedContent: 'first-payload' },
        },
      },
      {
        type: 'reasoning-end',
        id: '1',
        providerMetadata: {
          amazonBedrock: { redactedContent: 'second-payload' },
          bedrock: { redactedContent: 'second-payload' },
        },
      },
    ]);
  });
});
