import fs from 'node:fs';
import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
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

const openAIReasoningConfigError = fs.readFileSync(
  'src/__fixtures__/amazon-bedrock-openai-cris-reasoning-config-error.json',
  'utf8',
);

function createOpenAIReasoningModel(modelId: string, requestBodies: unknown[]) {
  return new BedrockChatLanguageModel(modelId, {
    baseUrl: () => 'https://bedrock-runtime.us-west-2.amazonaws.com',
    headers: {},
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requestBodies.push(body);

      const additionalFields = body.additionalModelRequestFields;
      const hasExpectedReasoningEffort =
        additionalFields?.reasoning?.effort === 'high' &&
        additionalFields?.reasoningConfig == null &&
        additionalFields?.reasoning_effort == null;

      if (!hasExpectedReasoningEffort) {
        return new Response(openAIReasoningConfigError, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(
        createStream([
          createEvent('contentBlockDelta', {
            contentBlockIndex: 0,
            delta: { text: 'OK' },
          }),
          createEvent('contentBlockStop', { contentBlockIndex: 0 }),
          createEvent('messageStop', { stopReason: 'end_turn' }),
        ]),
        {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        },
      );
    },
    generateId: () => 'test-id',
  });
}

describe('BedrockChatLanguageModel doStream event stream handling', () => {
  it.each(['us.openai.gpt-5.6-luna', 'global.openai.gpt-5.6-luna'])(
    'streams with nested reasoning.effort for CRIS model %s',
    async modelId => {
      const requestBodies: unknown[] = [];
      const { stream } = await createOpenAIReasoningModel(
        modelId,
        requestBodies,
      ).doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: false,
        providerOptions: {
          bedrock: {
            reasoningConfig: {
              maxReasoningEffort: 'high',
            },
          },
        },
      });

      const parts = await convertReadableStreamToArray(stream);

      expect(parts.filter(part => part.type === 'error')).toStrictEqual([]);
      expect(parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text-delta',
            delta: 'OK',
          }),
        ]),
      );
      expect(requestBodies).toEqual([
        expect.objectContaining({
          additionalModelRequestFields: {
            reasoning: {
              effort: 'high',
            },
          },
        }),
      ]);
    },
  );

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

  it.each([
    'internalServerException',
    'modelStreamErrorException',
    'serviceUnavailableException',
    'throttlingException',
    'validationException',
  ])('surfaces %s frames as stream errors', async exceptionType => {
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

    const { stream } = await createModel([exceptionFrame]).doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);

    expect(parts.at(-2)).toEqual({
      type: 'error',
      error: exception,
    });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: 'error',
    });
  });

  it('streams reasoning redacted as `redactedContent` for replay', async () => {
    const { stream } = await createModel([
      createEvent('contentBlockDelta', {
        contentBlockIndex: 0,
        delta: {
          reasoningContent: {
            redactedContent: 'encrypted-reasoning-',
          },
        },
      }),
      createEvent('contentBlockDelta', {
        contentBlockIndex: 0,
        delta: {
          reasoningContent: {
            redactedContent: 'payload',
          },
        },
      }),
      createEvent('contentBlockStop', {
        contentBlockIndex: 0,
      }),
      createEvent('contentBlockDelta', {
        contentBlockIndex: 1,
        delta: { text: 'The answer is 42.' },
      }),
      createEvent('contentBlockStop', {
        contentBlockIndex: 1,
      }),
      createEvent('messageStop', {
        stopReason: 'end_turn',
      }),
    ]).doStream({
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
    const { stream } = await createModel([
      createEvent('contentBlockDelta', {
        contentBlockIndex: 0,
        delta: {
          reasoningContent: { redactedContent: 'first-payload' },
        },
      }),
      createEvent('contentBlockStop', {
        contentBlockIndex: 0,
      }),
      createEvent('contentBlockDelta', {
        contentBlockIndex: 1,
        delta: {
          reasoningContent: { redactedContent: 'second-payload' },
        },
      }),
      createEvent('contentBlockStop', {
        contentBlockIndex: 1,
      }),
      createEvent('contentBlockDelta', {
        contentBlockIndex: 2,
        delta: { text: 'The answer is 42.' },
      }),
      createEvent('contentBlockStop', {
        contentBlockIndex: 2,
      }),
      createEvent('messageStop', {
        stopReason: 'end_turn',
      }),
    ]).doStream({
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
          bedrock: { redactedContent: 'first-payload' },
        },
      },
      {
        type: 'reasoning-end',
        id: '1',
        providerMetadata: {
          bedrock: { redactedContent: 'second-payload' },
        },
      },
    ]);
  });
});
