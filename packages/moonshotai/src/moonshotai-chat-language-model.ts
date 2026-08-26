import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type { OpenAICompatibleChatConfig } from '@ai-sdk/openai-compatible/internal';
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { convertMoonshotAIChatUsage } from './convert-moonshotai-chat-usage';
import { moonshotAIChatMetadataExtractor } from './moonshotai-chat-metadata-extractor';
import {
  getMoonshotAIModelFamily,
  isMoonshotAIKimiModel,
  type MoonshotAIChatModelId,
  type MoonshotAIProviderOptions,
} from './moonshotai-chat-options';
import { normalizeJsonSchemaForMFJS } from './normalize-json-schema-for-mfjs';

function transformMoonshotRequestBody(
  args: Record<string, any>,
): Record<string, any> {
  const { strictJsonSchema, max_tokens: maxTokens, ...transformedArgs } = args;
  const moonshotArgs: Record<string, any> = {
    ...transformedArgs,
    ...(maxTokens != null ? { max_completion_tokens: maxTokens } : {}),
  };
  const responseFormat = moonshotArgs.response_format;

  if (
    responseFormat?.type !== 'json_schema' ||
    responseFormat.json_schema?.schema == null
  ) {
    return moonshotArgs;
  }

  const { $schema: _$schema, ...schemaWithoutDollarSchema } =
    responseFormat.json_schema.schema;

  return {
    ...moonshotArgs,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: responseFormat.json_schema.name ?? 'response',
        strict: strictJsonSchema ?? true,
        schema: normalizeJsonSchemaForMFJS(schemaWithoutDollarSchema),
      },
    },
  };
}

function prepareSamplingOptions({
  modelId,
  options,
}: {
  modelId: MoonshotAIChatModelId;
  options: LanguageModelV2CallOptions;
}): {
  options: LanguageModelV2CallOptions;
  warnings: LanguageModelV2CallWarning[];
} {
  if (!isMoonshotAIKimiModel(modelId)) {
    return { options, warnings: [] };
  }

  const warnings: LanguageModelV2CallWarning[] = [];
  const samplingSettings = [
    ['temperature', options.temperature],
    ['topP', options.topP],
    ['frequencyPenalty', options.frequencyPenalty],
    ['presencePenalty', options.presencePenalty],
  ] as const;

  for (const [setting, value] of samplingSettings) {
    if (value != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting,
        details: `${setting} is fixed by model "${modelId}" and has been omitted.`,
      });
    }
  }

  return {
    options: {
      ...options,
      temperature: undefined,
      topP: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
    },
    warnings,
  };
}

function prepareToolChoiceOptions({
  modelId,
  options,
}: {
  modelId: MoonshotAIChatModelId;
  options: LanguageModelV2CallOptions;
}): {
  options: LanguageModelV2CallOptions;
  warnings: LanguageModelV2CallWarning[];
} {
  if (
    options.toolChoice?.type !== 'required' ||
    !['kimi-k2.6', 'kimi-k2.7'].includes(getMoonshotAIModelFamily(modelId))
  ) {
    return { options, warnings: [] };
  }

  return {
    options: { ...options, toolChoice: undefined },
    warnings: [
      {
        type: 'unsupported-setting',
        setting: 'toolChoice',
        details: `toolChoice "required" is not supported by model "${modelId}" and has been omitted; use "auto" or select a specific tool instead.`,
      },
    ],
  };
}

function prepareReasoningOptions({
  modelId,
  options,
}: {
  modelId: MoonshotAIChatModelId;
  options: LanguageModelV2CallOptions;
}): {
  options: LanguageModelV2CallOptions;
  warnings: LanguageModelV2CallWarning[];
} {
  const providerOptions = options.providerOptions?.moonshotai;
  if (
    providerOptions == null ||
    typeof providerOptions !== 'object' ||
    Array.isArray(providerOptions)
  ) {
    return { options, warnings: [] };
  }

  const moonshotOptions = providerOptions as MoonshotAIProviderOptions;
  const {
    reasoningEffort: requestedReasoningEffort,
    thinking: requestedThinking,
    reasoningHistory,
    ...otherMoonshotOptions
  } = moonshotOptions;
  const preserveReasoning = reasoningHistory === 'preserved';
  const warnings: LanguageModelV2CallWarning[] = [];

  if (requestedThinking?.budgetTokens != null) {
    warnings.push({
      type: 'other',
      message:
        'providerOptions.moonshotai.thinking.budgetTokens is deprecated because Moonshot Chat Completions does not support budget_tokens. The option has been omitted.',
    });
  }

  let thinking: { type: 'enabled' | 'disabled'; keep?: 'all' } | undefined;
  let reasoningEffort: 'low' | 'high' | 'max' | undefined;

  const warnUnsupportedReasoningEffort = () => {
    if (requestedReasoningEffort != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'providerOptions',
        details: `providerOptions.moonshotai.reasoningEffort is only supported by Kimi K3 and has been omitted for model "${modelId}".`,
      });
    }
  };

  switch (getMoonshotAIModelFamily(modelId)) {
    case 'kimi-k3': {
      if (requestedThinking != null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'Kimi K3 always reasons and does not accept providerOptions.moonshotai.thinking. The option has been omitted.',
        });
      }
      reasoningEffort = requestedReasoningEffort;
      break;
    }
    case 'kimi-k2.7': {
      warnUnsupportedReasoningEffort();
      if (requestedThinking?.type === 'disabled') {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'Kimi K2.7 thinking cannot be disabled. providerOptions.moonshotai.thinking has been omitted.',
        });
      } else if (requestedThinking?.type === 'enabled') {
        thinking = { type: 'enabled' };
      }
      break;
    }
    case 'kimi-k2.6': {
      warnUnsupportedReasoningEffort();
      const thinkingType = requestedThinking?.type;
      if (thinkingType != null || preserveReasoning) {
        thinking = {
          type: thinkingType ?? 'enabled',
          ...(preserveReasoning ? { keep: 'all' as const } : {}),
        };
      }
      break;
    }
    case 'kimi-k2.5': {
      warnUnsupportedReasoningEffort();
      if (requestedThinking?.type != null) {
        thinking = { type: requestedThinking.type };
      }
      if (preserveReasoning) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details: `providerOptions.moonshotai.reasoningHistory 'preserved' is not supported by model "${modelId}" and has been omitted.`,
        });
      }
      break;
    }
    case 'moonshot-v1': {
      warnUnsupportedReasoningEffort();
      if (requestedThinking != null) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details: `providerOptions.moonshotai.thinking is not supported by model "${modelId}" and has been omitted.`,
        });
      }
      if (preserveReasoning) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details: `providerOptions.moonshotai.reasoningHistory 'preserved' is not supported by model "${modelId}" and has been omitted.`,
        });
      }
      break;
    }
    case 'unknown': {
      reasoningEffort = requestedReasoningEffort;
      if (requestedThinking?.type != null) {
        thinking = { type: requestedThinking.type };
      }
      if (preserveReasoning) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details: `providerOptions.moonshotai.reasoningHistory 'preserved' is not supported by model "${modelId}" and has been omitted.`,
        });
      }
      break;
    }
  }

  return {
    options: {
      ...options,
      providerOptions: {
        ...options.providerOptions,
        moonshotai: {
          ...otherMoonshotOptions,
          ...(reasoningEffort != null ? { reasoningEffort } : {}),
          ...(thinking != null ? { thinking } : {}),
        },
      },
    },
    warnings,
  };
}

export class MoonshotAIChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  constructor(
    modelId: MoonshotAIChatModelId,
    config: OpenAICompatibleChatConfig,
  ) {
    super(modelId, {
      ...config,
      metadataExtractor: moonshotAIChatMetadataExtractor,
      transformRequestBody: args =>
        transformMoonshotRequestBody(
          config.transformRequestBody?.(args) ?? args,
        ),
    });
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { options: samplingOptions, warnings: samplingWarnings } =
      prepareSamplingOptions({ modelId: this.modelId, options });
    const { options: sanitizedOptions, warnings: reasoningWarnings } =
      prepareReasoningOptions({
        modelId: this.modelId,
        options: samplingOptions,
      });
    const { options: toolChoiceOptions, warnings: toolChoiceWarnings } =
      prepareToolChoiceOptions({
        modelId: this.modelId,
        options: sanitizedOptions,
      });
    const result = await super.doGenerate(toolChoiceOptions);

    // @ts-expect-error accessing response body from parent result
    const usage = result.response?.body?.usage;

    return {
      ...result,
      usage: convertMoonshotAIChatUsage(usage),
      warnings: [
        ...result.warnings,
        ...samplingWarnings,
        ...reasoningWarnings,
        ...toolChoiceWarnings,
      ],
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const originalIncludeRawChunks = options.includeRawChunks;
    const { options: samplingOptions, warnings: samplingWarnings } =
      prepareSamplingOptions({ modelId: this.modelId, options });
    const { options: sanitizedOptions, warnings: reasoningWarnings } =
      prepareReasoningOptions({
        modelId: this.modelId,
        options: samplingOptions,
      });
    const { options: toolChoiceOptions, warnings: toolChoiceWarnings } =
      prepareToolChoiceOptions({
        modelId: this.modelId,
        options: sanitizedOptions,
      });

    // Enable raw chunks to capture pre-Zod usage data, since MoonshotAI
    // returns cached_tokens at the top level of usage (not nested in
    // prompt_tokens_details) and the parent's z.object() schema strips it.
    const result = await super.doStream({
      ...toolChoiceOptions,
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
            if (chunk.type === 'stream-start') {
              controller.enqueue({
                ...chunk,
                warnings: [
                  ...chunk.warnings,
                  ...samplingWarnings,
                  ...reasoningWarnings,
                  ...toolChoiceWarnings,
                ],
              });
              return;
            }

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
