import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  isCustomReasoning,
  mapReasoningToProviderEffort,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertToMiniMaxMediaPart } from './convert-to-minimax-media-part';

type MiniMaxChatConfig = ConstructorParameters<
  typeof AnthropicLanguageModel
>[1];

export class MiniMaxChatLanguageModel extends AnthropicLanguageModel {
  constructor(modelId: string, config: MiniMaxChatConfig) {
    super(modelId, {
      ...config,
      convertMediaPart:
        modelId.toLowerCase() === 'minimax-m3.1-flash'
          ? convertToMiniMaxMediaPart
          : config.convertMediaPart,
      ...(modelId.toLowerCase() === 'minimax-m3.1-flash' && {
        maxTemperature: 2,
        supportsTemperatureAndTopPWithThinking: true,
      }),
    });
  }

  get supportedUrls() {
    return this.modelId.toLowerCase() === 'minimax-m3.1-flash'
      ? { 'image/*': [/^https?:\/\//], 'video/*': [/^https?:\/\//] }
      : super.supportedUrls;
  }

  static [WORKFLOW_SERIALIZE](model: MiniMaxChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: MiniMaxChatConfig;
  }) {
    return new MiniMaxChatLanguageModel(options.modelId, options.config);
  }

  private prepareCallOptions(options: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];
    const { reasoning, providerOptions } = options;

    if (
      this.modelId.toLowerCase() !== 'minimax-m3.1-flash' ||
      !isCustomReasoning(reasoning) ||
      providerOptions?.minimax?.effort != null ||
      providerOptions?.anthropic?.effort != null
    ) {
      return { options, warnings };
    }

    if (reasoning === 'none') {
      warnings.push({
        type: 'compatibility',
        feature: 'reasoning',
        details:
          `reasoning 'none' is not supported by ${this.modelId}; it always reasons. ` +
          `Using effort 'low' to minimize thinking instead.`,
      });
    }

    const effort =
      reasoning === 'none'
        ? 'low'
        : mapReasoningToProviderEffort({
            reasoning,
            effortMap: {
              minimal: 'low',
              low: 'low',
              medium: 'medium',
              high: 'high',
              xhigh: 'xhigh',
              max: 'max',
            },
            warnings,
          });

    return {
      options: {
        ...options,
        // Flash always reasons. Send effort without Anthropic thinking budgets.
        reasoning: undefined,
        providerOptions: {
          ...providerOptions,
          minimax: { ...providerOptions?.minimax, effort },
        },
      },
      warnings,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const prepared = this.prepareCallOptions(options);
    const result = await super.doGenerate(prepared.options);
    return { ...result, warnings: [...result.warnings, ...prepared.warnings] };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const prepared = this.prepareCallOptions(options);
    const result = await super.doStream(prepared.options);
    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV4StreamPart,
          LanguageModelV4StreamPart
        >({
          transform(part, controller) {
            controller.enqueue(
              part.type === 'stream-start'
                ? {
                    ...part,
                    warnings: [...part.warnings, ...prepared.warnings],
                  }
                : part,
            );
          },
        }),
      ),
    };
  }
}
