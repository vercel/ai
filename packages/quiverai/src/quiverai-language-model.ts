import {
  InvalidArgumentError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';

/** Applies QuiverAI's request policy while reusing the Open Responses transport. */
export class QuiverAILanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';

  constructor(private readonly model: LanguageModelV4) {}

  get modelId() {
    return this.model.modelId;
  }

  get provider() {
    return this.model.provider;
  }

  get supportedUrls() {
    return this.model.supportedUrls;
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const prepared = prepareQuiverAICall(options);
    const result = await this.model.doGenerate(prepared.options);
    return { ...result, warnings: [...prepared.warnings, ...result.warnings] };
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const prepared = prepareQuiverAICall(options);
    const result = await this.model.doStream(prepared.options);
    if (prepared.warnings.length === 0) return result;
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
                    warnings: [...prepared.warnings, ...part.warnings],
                  }
                : part,
            );
          },
        }),
      ),
    };
  }
}

function prepareQuiverAICall(options: LanguageModelV4CallOptions): {
  options: LanguageModelV4CallOptions;
  warnings: SharedV4Warning[];
} {
  const { reasoningEffort, reasoningSummary } =
    options.providerOptions?.quiverai ?? {};
  if (
    reasoningEffort != null &&
    (typeof reasoningEffort !== 'string' ||
      !['low', 'medium', 'high', 'xhigh'].includes(reasoningEffort))
  ) {
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: `Unsupported reasoning effort: ${reasoningEffort}`,
    });
  }
  if (reasoningSummary != null && reasoningSummary !== 'auto') {
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: `Unsupported reasoning summary: ${reasoningSummary}`,
    });
  }

  const warnings: SharedV4Warning[] = [];
  const omitReasoning = options.reasoning === 'none' && reasoningEffort == null;
  if (omitReasoning) {
    warnings.push({ type: 'unsupported', feature: 'reasoning effort none' });
  }

  return {
    warnings,
    options: {
      ...options,
      reasoning: omitReasoning ? undefined : options.reasoning,
      prompt: options.prompt.map(message =>
        message.role !== 'assistant'
          ? message
          : {
              ...message,
              content: message.content.map(part => {
                if (part.type !== 'reasoning') return part;
                const metadata =
                  part.providerOptions?.quiverai ??
                  (part as { providerMetadata?: SharedV4ProviderMetadata })
                    .providerMetadata?.quiverai;
                return {
                  ...part,
                  text: '',
                  providerOptions: {
                    ...part.providerOptions,
                    quiverai: {
                      itemId: metadata?.itemId,
                      reasoningSummary: metadata?.reasoningSummary,
                    },
                  },
                };
              }),
            },
      ),
    },
  };
}
