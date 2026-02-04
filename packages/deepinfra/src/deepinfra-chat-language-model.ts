import { LanguageModelV2, LanguageModelV2Usage } from '@ai-sdk/provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { FetchFunction } from '@ai-sdk/provider-utils';

type DeepInfraChatConfig = {
  provider: string;
  url: (options: { path: string; modelId?: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class DeepInfraChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  constructor(modelId: string, config: DeepInfraChatConfig) {
    super(modelId, config);
  }

  private fixUsage(usage: LanguageModelV2Usage): LanguageModelV2Usage {
    const outputTokens = usage.outputTokens ?? 0;
    const reasoningTokens = usage.reasoningTokens ?? 0;

    if (reasoningTokens > outputTokens) {
      const correctedOutputTokens = outputTokens + reasoningTokens;
      return {
        ...usage,
        outputTokens: correctedOutputTokens,
        totalTokens:
          usage.totalTokens != null
            ? usage.totalTokens + reasoningTokens
            : undefined,
      };
    }

    return usage;
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const result = await super.doGenerate(options);
    return {
      ...result,
      usage: this.fixUsage(result.usage),
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const result = await super.doStream(options);
    const fixUsage = this.fixUsage.bind(this);

    const transformedStream = result.stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (chunk.type === 'finish') {
            controller.enqueue({
              ...chunk,
              usage: fixUsage(chunk.usage),
            });
          } else {
            controller.enqueue(chunk);
          }
        },
      }),
    );

    return {
      ...result,
      stream: transformedStream,
    };
  }
}
