import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const signature = 'issue-18073-thought-signature';
const expectedProviderMetadata = {
  google: { thoughtSignature: signature },
};

function createStream(
  chunks: LanguageModelV4StreamPart[],
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function main() {
  const model = new MockLanguageModelV4({
    provider: 'google.generative-ai',
    modelId: 'gemini-test',
    doStream: async () => ({
      stream: createStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Visible text' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: '',
          providerMetadata: expectedProviderMetadata,
        },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
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
  });

  const result = streamText({
    model,
    prompt: 'Reproduce issue #18073',
  });

  const streamParts: Array<unknown> = [];
  for await (const part of result.stream) {
    streamParts.push(part);
  }

  const steps = await result.steps;
  const textPart = steps[0]?.content.find(part => part.type === 'text');
  const observedProviderMetadata = textPart?.providerMetadata;

  if (
    JSON.stringify(observedProviderMetadata) !==
    JSON.stringify(expectedProviderMetadata)
  ) {
    throw new Error(
      `ISSUE #18073 REPRODUCED: final step text providerMetadata is ${JSON.stringify(
        observedProviderMetadata,
      )}; expected ${JSON.stringify(expectedProviderMetadata)}`,
    );
  }

  const forwardedMetadataDelta = streamParts.find(
    part =>
      typeof part === 'object' &&
      part != null &&
      'type' in part &&
      part.type === 'text-delta' &&
      'text' in part &&
      part.text === '' &&
      'providerMetadata' in part &&
      JSON.stringify(part.providerMetadata) ===
        JSON.stringify(expectedProviderMetadata),
  );

  if (forwardedMetadataDelta == null) {
    throw new Error(
      'ISSUE #18073: metadata-bearing empty text delta was not forwarded',
    );
  }

  console.log(
    'Issue #18073 is not reproduced: metadata was retained and forwarded.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
