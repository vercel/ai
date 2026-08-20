import {
  parseJsonEventStream,
  streamText,
  TypeValidationError,
  uiMessageChunkSchema,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

const failureSignal =
  'ISSUE 11269 REPRODUCED: ai@5.0.53 rejected the stream finish chunk {"type":"finish","finishReason":"stop"} with AI_TypeValidationError.';

// This is the subset of ai@5.0.53's strict UI message chunk schema needed to
// consume the deterministic stream produced below. Its finish chunk did not
// allow the finishReason field added by newer servers.
const ai5053UiMessageChunkSchema = z.union([
  z.strictObject({
    type: z.literal('start'),
    messageId: z.string().optional(),
    messageMetadata: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal('start-step'),
  }),
  z.strictObject({
    type: z.literal('text-start'),
    id: z.string(),
    providerMetadata: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal('text-delta'),
    id: z.string(),
    delta: z.string(),
    providerMetadata: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal('text-end'),
    id: z.string(),
    providerMetadata: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal('finish-step'),
  }),
  z.strictObject({
    type: z.literal('finish'),
    messageMetadata: z.unknown().optional(),
  }),
]);

function createSseStream(value: string): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream([new TextEncoder().encode(value)]);
}

async function consumeUiMessageStream({
  sse,
  schema,
}: {
  sse: string;
  schema: Parameters<typeof parseJsonEventStream>[0]['schema'];
}) {
  let text = '';
  let sawFinish = false;
  const reader = parseJsonEventStream({
    stream: createSseStream(sse),
    schema,
  }).getReader();

  while (true) {
    const { done, value: result } = await reader.read();

    if (done) {
      break;
    }

    if (!result.success) {
      throw result.error;
    }

    const chunk = result.value as {
      type?: unknown;
      delta?: unknown;
    };

    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      text += chunk.delta;
    } else if (chunk.type === 'finish') {
      sawFinish = true;
    }
  }

  return { sawFinish, text };
}

function assertCompletedStream({
  client,
  result,
}: {
  client: string;
  result: { sawFinish: boolean; text: string };
}) {
  if (result.text !== 'Hello') {
    throw new Error(`${client} did not receive the complete text response.`);
  }

  if (!result.sawFinish) {
    throw new Error(`${client} did not receive the terminal finish chunk.`);
  }
}

function isReportedFinishValidationError(
  error: unknown,
): error is TypeValidationError {
  if (!TypeValidationError.isInstance(error)) {
    return false;
  }

  const value = error.value;

  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'finish' &&
    'finishReason' in value &&
    value.finishReason === 'stop'
  );
}

async function main() {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: 'Hello' },
          { type: 'text-end', id: '0' },
          {
            type: 'finish',
            finishReason: { raw: undefined, unified: 'stop' },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: undefined,
              },
            },
          },
        ]),
      }),
    }),
    prompt: 'Say hello.',
  });

  const sse = await result.toUIMessageStreamResponse().text();

  // Upgrading the frontend first is the reporter's working deployment order.
  assertCompletedStream({
    client: 'Current frontend',
    result: await consumeUiMessageStream({
      sse,
      schema: uiMessageChunkSchema,
    }),
  });

  try {
    assertCompletedStream({
      client: 'ai@5.0.53 frontend',
      result: await consumeUiMessageStream({
        sse,
        schema: ai5053UiMessageChunkSchema,
      }),
    });
  } catch (error) {
    if (isReportedFinishValidationError(error)) {
      console.error(failureSignal);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
