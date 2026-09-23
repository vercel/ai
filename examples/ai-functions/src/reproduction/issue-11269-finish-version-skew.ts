import {
  parseJsonEventStream,
  streamText,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from 'ai';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  MockLanguageModelV2,
} from 'ai/test';
import { z } from 'zod/v4';

// This is the relevant ai@5.0.53 UI message chunk schema. Its strict finish
// variant did not allow the finishReason field added by ai@5.0.92.
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

function createSseStream(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return convertArrayToReadableStream([
    ...chunks.map(chunk =>
      encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
    ),
    encoder.encode('data: [DONE]\n\n'),
  ]);
}

async function consumeUiMessageStream({
  chunks,
  schema,
}: {
  chunks: unknown[];
  schema: Parameters<typeof parseJsonEventStream>[0]['schema'];
}) {
  const results = parseJsonEventStream({
    stream: createSseStream(chunks),
    schema,
  });

  for await (const result of results) {
    if (result.success === false) {
      throw result.error;
    }
  }
}

async function main() {
  const result = streamText({
    model: new MockLanguageModelV2({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-start' as const, id: 'text-1' },
          {
            type: 'text-delta' as const,
            id: 'text-1',
            delta: 'Hello',
          },
          { type: 'text-end' as const, id: 'text-1' },
          {
            type: 'finish' as const,
            finishReason: 'stop' as const,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          },
        ]),
      }),
    }),
    prompt: 'Say hello.',
  });

  const chunks = await convertReadableStreamToArray(result.toUIMessageStream());
  const finishChunk = chunks.find(
    (chunk): chunk is UIMessageChunk & { type: 'finish' } =>
      chunk.type === 'finish',
  );

  if (
    finishChunk == null ||
    finishChunk.finishReason !== 'stop' ||
    JSON.stringify(finishChunk) !==
      JSON.stringify({ type: 'finish', finishReason: 'stop' })
  ) {
    throw new Error(
      `Expected the backend stream to contain {"type":"finish","finishReason":"stop"}, received ${JSON.stringify(
        finishChunk,
      )}`,
    );
  }

  await consumeUiMessageStream({
    chunks,
    schema: uiMessageChunkSchema,
  });

  await consumeUiMessageStream({
    chunks: [{ type: 'finish' }],
    schema: uiMessageChunkSchema,
  });

  await consumeUiMessageStream({
    chunks,
    schema: ai5053UiMessageChunkSchema,
  });

  throw new Error(
    'Expected the ai@5.0.53 frontend schema to reject the newer finish chunk.',
  );
}

await main();
