import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { OpenAICompatibleChatConfig } from '@ai-sdk/openai-compatible/internal';
import { LanguageModelV2, LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { convertMoonshotAIChatUsage } from './convert-moonshotai-chat-usage';
import { MoonshotAIChatModelId } from './moonshotai-chat-options';

export class MoonshotAIChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  constructor(
    modelId: MoonshotAIChatModelId,
    config: OpenAICompatibleChatConfig,
  ) {
    super(modelId, config);
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const result = await super.doGenerate(options);

    // @ts-expect-error accessing response body from parent result
    const usage = result.response?.body?.usage;

    return {
      ...result,
      usage: convertMoonshotAIChatUsage(usage),
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const originalIncludeRawChunks = options.includeRawChunks;

    // Enable raw chunks to capture pre-Zod usage data, since MoonshotAI
    // returns cached_tokens at the top level of usage (not nested in
    // prompt_tokens_details) and the parent's z.object() schema strips it.
    const result = await super.doStream({
      ...options,
      includeRawChunks: true,
    });

    let rawUsage: unknown = undefined;

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV2StreamPart,
          LanguageModelV2StreamPart
        >({
          transform(chunk, controller) {
            if (chunk.type === 'raw') {
              // Capture raw usage data before Zod strips cached_tokens
              const rawValue = chunk.rawValue as Record<string, unknown>;
              if (rawValue?.usage != null) {
                rawUsage = rawValue.usage;
              }

              // Only forward raw chunks if originally requested
              if (originalIncludeRawChunks) {
                controller.enqueue(chunk);
              }
              return;
            }

            if (chunk.type === 'finish') {
              // Re-convert usage from raw data to capture cached_tokens
              controller.enqueue({
                ...chunk,
                usage: rawUsage
                  ? convertMoonshotAIChatUsage(rawUsage as any)
                  : chunk.usage,
              });
              return;
            }

            controller.enqueue(chunk);
          },
        }),
      ),
    };
  }
}
