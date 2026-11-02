import {
  APICallError,
  TypeValidationError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const codec = new EventStreamCodec(toUtf8, fromUtf8);

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const completeUsage = {
  inputTokens: 13,
  outputTokens: 5,
  totalTokens: 18,
  cacheReadInputTokens: 3,
  cacheWriteInputTokens: 2,
  cacheDetails: [
    {
      inputTokens: 2,
      ttl: 'T5M',
      providerCacheMetadata: {
        source: 'provider',
      },
    },
  ],
  providerUsageMetadata: {
    serverToolUsage: {},
  },
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

function createModel({
  generateUsage = completeUsage,
  streamUsage = completeUsage,
}: {
  generateUsage?: Record<string, unknown>;
  streamUsage?: Record<string, unknown>;
} = {}) {
  return new AmazonBedrockChatLanguageModel(
    'anthropic.claude-3-haiku-20240307-v1:0',
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      generateId: () => 'test-id',
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

        return new Response(
          createStream([
            createEventFrame('messageStop', { stopReason: 'end_turn' }),
            createEventFrame('metadata', {
              metrics: { latencyMs: 1 },
              usage: streamUsage,
            }),
          ]),
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

function expectNormalizedUsage(
  usage: Awaited<
    ReturnType<AmazonBedrockChatLanguageModel['doGenerate']>
  >['usage'],
) {
  expect(usage.inputTokens).toStrictEqual({
    total: 18,
    noCache: 13,
    cacheRead: 3,
    cacheWrite: 2,
  });
  expect(usage.outputTokens).toStrictEqual({
    total: 5,
    text: 5,
    reasoning: undefined,
  });
}

async function expectInvalidResponseField(
  result: PromiseLike<unknown>,
  field: string,
) {
  let error: unknown;
  try {
    await result;
  } catch (caughtError) {
    error = caughtError;
  }

  expect(APICallError.isInstance(error)).toBe(true);
  if (!APICallError.isInstance(error)) {
    throw error;
  }

  expect(error.message).toBe('Invalid JSON response');
  expect(TypeValidationError.isInstance(error.cause)).toBe(true);
  if (!TypeValidationError.isInstance(error.cause)) {
    throw error.cause;
  }

  expect(error.cause.message).toContain(`"${field}"`);
}

describe('AmazonBedrockChatLanguageModel raw usage', () => {
  it('preserves complete raw usage through doGenerate parsing', async () => {
    const result = await createModel().doGenerate({ prompt });

    expect(result.usage.raw).toStrictEqual(completeUsage);
    expectNormalizedUsage(result.usage);
  });

  it('preserves complete raw usage through the event-stream parser', async () => {
    const { stream } = await createModel().doStream({
      prompt,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);
    const finishPart = parts.find(part => part.type === 'finish');

    expect(finishPart).toBeDefined();
    if (finishPart?.type !== 'finish') {
      expect.fail('Expected a finish part');
    }
    expect(finishPart.usage.raw).toStrictEqual(completeUsage);
    expectNormalizedUsage(finishPart.usage);
  });

  it('validates known cache detail fields during doGenerate parsing', async () => {
    const model = createModel({
      generateUsage: {
        ...completeUsage,
        cacheDetails: [{ inputTokens: '2', ttl: 'T5M' }],
      },
    });

    await expectInvalidResponseField(
      model.doGenerate({ prompt }),
      'inputTokens',
    );
  });

  it('validates totalTokens in streaming usage', async () => {
    const { stream } = await createModel({
      streamUsage: {
        ...completeUsage,
        totalTokens: '18',
      },
    }).doStream({
      prompt,
      includeRawChunks: false,
    });
    const parts = await convertReadableStreamToArray(stream);

    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({
            message: expect.stringContaining('totalTokens'),
          }),
        }),
      ]),
    );
  });
});
