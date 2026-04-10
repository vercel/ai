import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { OpenAICompatibleChatConfig } from '@ai-sdk/openai-compatible/internal';
import {
  deserializeModel,
  serializeModel,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import {
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import { convertMoonshotAIChatUsage } from './convert-moonshotai-chat-usage';
import { MoonshotAIChatModelId } from './moonshotai-chat-options';

export class MoonshotAIChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  static [WORKFLOW_SERIALIZE](inst: MoonshotAIChatLanguageModel) {
    return serializeModel(inst);
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MoonshotAIChatModelId;
    config: OpenAICompatibleChatConfig;
  }) {
    return deserializeModel(MoonshotAIChatLanguageModel, options);
  }

  constructor(
    modelId: MoonshotAIChatModelId,
    config: OpenAICompatibleChatConfig,
  ) {
    super(modelId, config);
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const result = await super.doGenerate(options);

    // @ts-expect-error accessing response body from parent result
    const usage = result.response?.body?.usage;

    return {
      ...result,
      usage: convertMoonshotAIChatUsage(usage),
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const result = await super.doStream(options);

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV4StreamPart,
          LanguageModelV4StreamPart
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
