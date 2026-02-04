import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { OpenAICompatibleChatConfig } from '@ai-sdk/openai-compatible/internal';
import { LanguageModelV2 } from '@ai-sdk/provider';
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
}
