import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleChatConfig,
} from '@ai-sdk/openai-compatible';
import {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { ParseResult } from '@ai-sdk/provider-utils';
import { convertMoonshotAIChatUsage } from './convert-moonshotai-chat-usage';
import { MoonshotAIChatModelId } from './moonshotai-chat-options';

/**
 * Custom Moonshot AI chat model that extends OpenAI-compatible model
 * with custom usage parsing to handle top-level cached_tokens.
 */
export class MoonshotAIChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  constructor(
    modelId: MoonshotAIChatModelId,
    config: OpenAICompatibleChatConfig,
  ) {
    super(modelId, config);
  }

  /**
   * Override doGenerate to use Moonshot-specific usage conversion
   */
  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const result = await super.doGenerate(options);

    // Replace usage with Moonshot-specific conversion
    // @ts-expect-error - accessing response body from parent result
    const usage = result.response?.body?.usage;

    return {
      ...result,
      usage: convertMoonshotAIChatUsage(usage),
    };
  }

  /**
   * Override doStream to use Moonshot-specific usage conversion
   */
  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const result = await super.doStream(options);

    // Intercept stream to convert usage
    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
        >({
          transform(chunk, controller) {
            if (chunk.type === 'finish' && chunk.usage) {
              // Re-convert usage using Moonshot format
              controller.enqueue({
                ...chunk,
                usage: convertMoonshotAIChatUsage(chunk.usage.raw as any),
              });
            } else {
              controller.enqueue(chunk);
            }
          },
        }),
      ),
    };
  }
}
