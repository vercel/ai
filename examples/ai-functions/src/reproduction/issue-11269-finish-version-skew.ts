import { parseJsonEventStream, streamText, uiMessageChunkSchema } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

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
  }
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
  const reportedFinishChunk = 'data: {"type":"finish","finishReason":"stop"}';

  if (!sse.includes(reportedFinishChunk)) {
    throw new Error(`Backend did not emit ${reportedFinishChunk}`);
  }

  // The current client accepts the current server stream.
  await consumeUiMessageStream({ sse, schema: uiMessageChunkSchema });

  // The reported ai@5.0.53 client rejects the newer finish chunk here.
  await consumeUiMessageStream({
    sse,
    schema: ai5053UiMessageChunkSchema,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
