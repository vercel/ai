import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import { generateText, streamText, wrapLanguageModel } from 'ai';

const googleProviderOptions = {
  thinkingConfig: { includeThoughts: true },
};

const usage: LanguageModelV4Usage = {
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
};

const hasInjectedGoogleOptions = (
  providerOptions: LanguageModelV4CallOptions['providerOptions'],
) => {
  const googleOptions = providerOptions?.google;

  if (
    typeof googleOptions !== 'object' ||
    googleOptions == null ||
    Array.isArray(googleOptions)
  ) {
    return false;
  }

  return (
    (googleOptions as { thinkingConfig?: { includeThoughts?: unknown } })
      .thinkingConfig?.includeThoughts === true
  );
};

const streamFromParts = (parts: LanguageModelV4StreamPart[]) =>
  new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }

      controller.close();
    },
  });

async function main() {
  const calls: Array<{
    type: 'generate' | 'stream';
    providerOptions: LanguageModelV4CallOptions['providerOptions'];
  }> = [];

  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'issue-15704-reproduction',
    modelId: 'fake-model',
    supportedUrls: {},
    async doGenerate(
      params: LanguageModelV4CallOptions,
    ): Promise<LanguageModelV4GenerateResult> {
      calls.push({ type: 'generate', providerOptions: params.providerOptions });

      return {
        content: hasInjectedGoogleOptions(params.providerOptions)
          ? [
              { type: 'reasoning', text: 'provider options reached generate' },
              { type: 'text', text: 'ok' },
            ]
          : [{ type: 'text', text: 'missing provider options' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
    async doStream(
      params: LanguageModelV4CallOptions,
    ): Promise<LanguageModelV4StreamResult> {
      calls.push({ type: 'stream', providerOptions: params.providerOptions });

      return {
        stream: streamFromParts([
          { type: 'stream-start', warnings: [] },
          ...(hasInjectedGoogleOptions(params.providerOptions)
            ? [
                { type: 'reasoning-start' as const, id: 'reasoning-1' },
                {
                  type: 'reasoning-delta' as const,
                  id: 'reasoning-1',
                  delta: 'provider options reached stream',
                },
                { type: 'reasoning-end' as const, id: 'reasoning-1' },
              ]
            : []),
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'ok' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  };

  const wrappedModel = wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        (params.providerOptions ??= {} as SharedV4ProviderOptions).google =
          googleProviderOptions;
        return params;
      },
    },
  });

  const generateResult = await generateText({
    model: wrappedModel,
    prompt: 'hi',
  });

  const streamResult = streamText({
    model: wrappedModel,
    prompt: 'hi',
  });

  for await (const _ of streamResult.fullStream) {
    // Drain the stream so that streamResult.reasoning is resolved.
  }

  const reasoning = {
    generateText: generateResult.reasoning.length > 0,
    streamText: (await streamResult.reasoning).length > 0,
  };

  const providerOptionsReached = {
    generateText: hasInjectedGoogleOptions(calls[0]?.providerOptions),
    streamText: hasInjectedGoogleOptions(calls[1]?.providerOptions),
  };

  console.log(
    JSON.stringify(
      {
        reasoning,
        providerOptionsReached,
        calls,
      },
      null,
      2,
    ),
  );

  if (
    !providerOptionsReached.generateText ||
    !providerOptionsReached.streamText
  ) {
    throw new Error('Transformed providerOptions did not reach the model.');
  }

  if (!reasoning.generateText || !reasoning.streamText) {
    throw new Error(
      'Expected both generateText and streamText to show reasoning.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
