import {
  parseJsonEventStream,
  streamText,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from 'ai';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  MockLanguageModelV3,
} from 'ai/test';
import { z } from 'zod/v4';

const ai5053StreamChunkSchema = z.union([
  z.strictObject({
    type: z.literal('text-start'),
    id: z.string(),
    providerMetadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.strictObject({
    type: z.literal('text-delta'),
    id: z.string(),
    delta: z.string(),
    providerMetadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.strictObject({
    type: z.literal('text-end'),
    id: z.string(),
    providerMetadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.strictObject({
    type: z.literal('start-step'),
  }),
  z.strictObject({
    type: z.literal('finish-step'),
  }),
  z.strictObject({
    type: z.literal('start'),
    messageId: z.string().optional(),
    messageMetadata: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal('finish'),
    messageMetadata: z.unknown().optional(),
  }),
]);

function createSseStream(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.close();
    },
  });
}

async function main() {
  const result = streamText({
    model: new MockLanguageModelV3({
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
            finishReason: { raw: 'stop', unified: 'stop' as const },
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

  const currentParseResults = await convertReadableStreamToArray(
    parseJsonEventStream({
      stream: createSseStream(chunks),
      schema: uiMessageChunkSchema,
    }),
  );

  if (currentParseResults.some(result => !result.success)) {
    throw new Error(
      'The current client schema unexpectedly rejected the stream.',
    );
  }

  const currentClientOldBackendResults = await convertReadableStreamToArray(
    parseJsonEventStream({
      stream: createSseStream([{ type: 'finish' }]),
      schema: uiMessageChunkSchema,
    }),
  );

  if (currentClientOldBackendResults.some(result => !result.success)) {
    throw new Error(
      'The current client schema unexpectedly rejected the older finish chunk.',
    );
  }

  const oldClientParseResults = parseJsonEventStream({
    stream: createSseStream(chunks),
    schema: ai5053StreamChunkSchema,
  });
  const reader = oldClientParseResults.getReader();

  while (true) {
    const { done, value: parseResult } = await reader.read();
    if (done) {
      break;
    }
    if (!parseResult.success) {
      throw parseResult.error;
    }
  }

  throw new Error(
    'Expected the ai@5.0.53 frontend schema to reject the newer finish chunk.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
