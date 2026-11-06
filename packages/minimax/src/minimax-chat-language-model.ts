import { getMiniMaxLanguageModelEntry } from './minimax-model-catalog';
import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import type {
  LanguageModelV4,
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

export class MiniMaxChatLanguageModel
  extends AnthropicLanguageModel
  implements LanguageModelV4
{
  private readonly supportsM31Features: boolean;

  constructor(modelId: string, config: MiniMaxChatConfig) {
    const supportsM31Features =
      getMiniMaxLanguageModelEntry(modelId).capabilities.language.m31Features;
    super(modelId, {
      ...config,
      ...(supportsM31Features && {
        convertMediaPart: convertToMiniMaxMediaPart,
        maxTemperature: 2,
        supportsTemperatureAndTopPWithThinking: true,
        cacheControlProviderOptionsName: 'minimax',
      }),
    });
    this.supportsM31Features = supportsM31Features;
  }

  get supportedUrls() {
    return this.supportsM31Features
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
      !this.supportsM31Features ||
      !isCustomReasoning(reasoning) ||
      providerOptions?.minimax?.effort != null ||
      providerOptions?.anthropic?.effort != null
    ) {
      return { options, warnings };
    }

    const effort = mapReasoningToProviderEffort({
      reasoning,
      effortMap: {
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
        // M3.1 and later use effort instead of Anthropic thinking budgets.
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
