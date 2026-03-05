import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { OpenAICompatibleChatConfig } from '@ai-sdk/openai-compatible/internal';
import {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
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
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const result = await super.doGenerate(options);

    // @ts-expect-error accessing response body from parent result
    const usage = result.response?.body?.usage;

    return {
      ...result,
      usage: convertMoonshotAIChatUsage(usage),
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const result = await super.doStream(options);

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
        >({
          transform(chunk, controller) {
            if (chunk.type === 'finish' && chunk.usage) {
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
