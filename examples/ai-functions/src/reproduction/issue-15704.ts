import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { generateText, streamText, wrapLanguageModel } from 'ai';

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 1,
  },
};

const hasIncludeThoughts = (options: LanguageModelV3CallOptions) =>
  (
    options.providerOptions?.google as
      | { thinkingConfig?: { includeThoughts?: boolean } }
      | undefined
  )?.thinkingConfig?.includeThoughts === true;

function streamFromArray<T>(values: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const value of values) {
        controller.enqueue(value);
      }
      controller.close();
    },
  });
}

async function main() {
  const providerOptionsReached = {
    generateText: false,
    streamText: false,
  };

  const baseModel: LanguageModelV3 = {
    specificationVersion: 'v3',
    provider: 'fake-provider',
    modelId: 'fake-model',
    supportedUrls: {},
    async doGenerate(options): Promise<LanguageModelV3GenerateResult> {
      providerOptionsReached.generateText = hasIncludeThoughts(options);

      return {
        content: [
          ...(hasIncludeThoughts(options)
            ? ([{ type: 'reasoning', text: 'thinking' }] as const)
            : []),
          { type: 'text', text: 'hi' },
        ],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
    async doStream(options) {
      providerOptionsReached.streamText = hasIncludeThoughts(options);

      const parts: LanguageModelV3StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        ...(hasIncludeThoughts(options)
          ? ([
              { type: 'reasoning-start', id: 'reasoning-1' },
              {
                type: 'reasoning-delta',
                id: 'reasoning-1',
                delta: 'thinking',
              },
              { type: 'reasoning-end', id: 'reasoning-1' },
            ] satisfies LanguageModelV3StreamPart[])
          : []),
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'hi' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ];

      return { stream: streamFromArray(parts) };
    },
  };

  const model = wrapLanguageModel({
    model: baseModel,
    middleware: {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        (params.providerOptions ??= {}).google = {
          thinkingConfig: { includeThoughts: true },
        };
        return params;
      },
    },
  });

  console.log('=== generateText ===');
  const generateResult = await generateText({ model, prompt: 'hi' });
  const generateHasReasoning = generateResult.reasoning.length > 0;
  console.log('reasoning:', generateHasReasoning ? 'YES' : 'NO');

  console.log('=== streamText ===');
  const streamResult = streamText({ model, prompt: 'hi' });
  for await (const _ of streamResult.fullStream) {
    // Consume the stream the same way as the issue reproduction.
  }
  const streamHasReasoning = (await streamResult.reasoning).length > 0;
  console.log('reasoning:', streamHasReasoning ? 'YES' : 'NO');

  console.log(
    JSON.stringify(
      {
        providerOptionsReached,
        reasoning: {
          generateText: generateHasReasoning,
          streamText: streamHasReasoning,
        },
      },
      null,
      2,
    ),
  );

  if (
    !providerOptionsReached.generateText ||
    !providerOptionsReached.streamText ||
    !generateHasReasoning ||
    !streamHasReasoning
  ) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
