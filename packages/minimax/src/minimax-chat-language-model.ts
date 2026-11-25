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
  private readonly requestConfig: ReturnType<
    typeof getMiniMaxLanguageModelEntry
  >['requestConfig']['language'];

  constructor(modelId: string, config: MiniMaxChatConfig) {
    const requestConfig =
      getMiniMaxLanguageModelEntry(modelId).requestConfig.language;
    super(modelId, {
      ...config,
      ...(requestConfig.mediaUrls && {
        convertMediaPart: convertToMiniMaxMediaPart,
      }),
      ...(requestConfig.maxTemperature != null && {
        maxTemperature: requestConfig.maxTemperature,
      }),
      ...(requestConfig.samplingWithThinking && {
        supportsTemperatureAndTopPWithThinking: true,
      }),
      ...(requestConfig.cacheControl === 'minimax' && {
        cacheControlProviderOptionsName: 'minimax',
      }),
    });
    this.requestConfig = requestConfig;
  }

  get supportedUrls() {
    return this.requestConfig.mediaUrls
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
      this.requestConfig.reasoning !== 'effort' ||
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
        // Sent as effort instead of an Anthropic thinking budget.
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
