import {
  TooManyEmbeddingValuesForCallError,
  UnsupportedFunctionalityError,
  type EmbeddingModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  alibabaEmbeddingModelOptions,
  type AlibabaEmbeddingModelOptions,
  type AlibabaEmbeddingModelId,
} from './alibaba-embedding-model-options';
import type { AlibabaConfig } from './alibaba-config';

const alibabaEmbeddingFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.object({
    code: z.string().nullish(),
    message: z.string(),
    request_id: z.string().nullish(),
  }),
  errorToMessage: data => data.message,
});

const multimodalEmbeddingModelIds = new Set<string>([
  'qwen3-vl-embedding',
  'qwen2.5-vl-embedding',
  'tongyi-embedding-vision-plus',
  'tongyi-embedding-vision-flash',
  'multimodal-embedding-v1',
  'tongyi-embedding-vision-plus-2026-03-06',
]);

function isMultimodalEmbeddingModel(modelId: string): boolean {
  return multimodalEmbeddingModelIds.has(modelId);
}

function isMultimodalEmbeddingCall({
  modelId,
  options,
}: {
  modelId: string;
  options: AlibabaEmbeddingModelOptions | undefined;
}): boolean {
  return (
    isMultimodalEmbeddingModel(modelId) ||
    options?.content != null ||
    options?.enableFusion != null ||
    options?.fps != null ||
    options?.resLevel != null ||
    options?.maxVideoFrames != null
  );
}

function convertToAlibabaMultimodalContent(
  content: NonNullable<AlibabaEmbeddingModelOptions['content']>[number],
): Record<string, unknown> {
  switch (content.type) {
    case 'text':
      return { text: content.text };
    case 'image':
      return { image: content.image };
    case 'video':
      return { video: content.video };
    case 'multiImages':
      return { multi_images: content.images };
  }
}

export class AlibabaEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: AlibabaEmbeddingModelId;
  readonly supportsParallelCalls = false;

  private readonly config: AlibabaConfig;

  static [WORKFLOW_SERIALIZE](model: AlibabaEmbeddingModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AlibabaEmbeddingModelId;
    config: AlibabaConfig;
  }) {
    return new AlibabaEmbeddingModel(options.modelId, options.config);
  }

  constructor(modelId: AlibabaEmbeddingModelId, config: AlibabaConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  get maxEmbeddingsPerCall(): number {
    return isMultimodalEmbeddingModel(this.modelId) ? 1 : 10;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV4['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>
  > {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    const alibabaOptions = await parseProviderOptions({
      provider: 'alibaba',
      providerOptions,
      schema: alibabaEmbeddingModelOptions,
    });

    // TODO: Explore first-class sparse embedding support in AI SDK core.
    if (alibabaOptions?.outputType === 'sparse') {
      throw new UnsupportedFunctionalityError({
        functionality: "Alibaba embedding outputType 'sparse'",
        message:
          "Alibaba embedding outputType 'sparse' is not supported because AI SDK embeddings require dense number arrays. Use 'dense' or 'dense&sparse' instead.",
      });
    }

    const isMultimodalCall = isMultimodalEmbeddingCall({
      modelId: this.modelId,
      options: alibabaOptions,
    });

    if (isMultimodalCall) {
      if (values.length > 1) {
        throw new UnsupportedFunctionalityError({
          functionality: 'Alibaba multimodal embeddings with multiple values',
          message:
            'Alibaba multimodal embeddings are limited to one AI SDK embedding value per provider call.',
        });
      }

      if (
        alibabaOptions?.outputType != null &&
        alibabaOptions.outputType !== 'dense'
      ) {
        throw new UnsupportedFunctionalityError({
          functionality: `Alibaba multimodal embedding outputType '${alibabaOptions.outputType}'`,
          message:
            "Alibaba multimodal embeddings only support outputType 'dense'.",
        });
      }

      return this.doMultimodalEmbed({
        values,
        headers,
        abortSignal,
        alibabaOptions,
      });
    }

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/services/embeddings/text-embedding/text-embedding`,
      headers: combineHeaders(this.config.headers?.(), headers),
      body: {
        model: this.modelId,
        input: {
          texts: values,
        },
        parameters: {
          text_type: alibabaOptions?.textType,
          dimension: alibabaOptions?.dimension,
          output_type: alibabaOptions?.outputType,
        },
      },
      failedResponseHandler: alibabaEmbeddingFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        alibabaTextEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    const sortedEmbeddings = response.output.embeddings.sort(
      (a, b) => a.text_index - b.text_index,
    );
    const sparseEmbeddings = sortedEmbeddings
      .map(item =>
        item.sparse_embedding == null
          ? undefined
          : {
              textIndex: item.text_index,
              sparseEmbedding: item.sparse_embedding,
            },
      )
      .filter(item => item != null);

    return {
      warnings: [],
      embeddings: sortedEmbeddings.map(item => item.embedding),
      usage: response.usage
        ? { tokens: response.usage.total_tokens }
        : undefined,
      providerMetadata:
        sparseEmbeddings.length > 0
          ? {
              alibaba: {
                sparseEmbeddings,
              },
            }
          : undefined,
      response: { headers: responseHeaders, body: rawValue },
    };
  }

  private async doMultimodalEmbed({
    values,
    headers,
    abortSignal,
    alibabaOptions,
  }: {
    values: string[];
    headers: Parameters<EmbeddingModelV4['doEmbed']>[0]['headers'];
    abortSignal: Parameters<EmbeddingModelV4['doEmbed']>[0]['abortSignal'];
    alibabaOptions: AlibabaEmbeddingModelOptions | undefined;
  }): Promise<Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>> {
    const content = alibabaOptions?.content;
    const contents = [
      ...(values[0] !== '' || content == null ? [{ text: values[0] }] : []),
      ...(content?.map(convertToAlibabaMultimodalContent) ?? []),
    ];

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${
        this.config.multimodalBaseURL ?? this.config.baseURL
      }/services/embeddings/multimodal-embedding/multimodal-embedding`,
      headers: combineHeaders(this.config.headers?.(), headers),
      body: {
        model: this.modelId,
        input: {
          contents,
        },
        parameters: {
          output_type: alibabaOptions?.outputType,
          dimension: alibabaOptions?.dimension,
          fps: alibabaOptions?.fps,
          instruct: alibabaOptions?.instruct,
          enable_fusion: alibabaOptions?.enableFusion,
          res_level: alibabaOptions?.resLevel,
          max_video_frames: alibabaOptions?.maxVideoFrames,
        },
      },
      failedResponseHandler: alibabaEmbeddingFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        alibabaMultimodalEmbeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    const sortedEmbeddings = response.output.embeddings.sort(
      (a, b) => a.index - b.index,
    );

    if (sortedEmbeddings.length !== values.length) {
      // TODO: Add core AI SDK support for one embedding input returning multiple independent embeddings.
      throw new UnsupportedFunctionalityError({
        functionality: 'Alibaba multimodal independent embeddings',
        message:
          `Alibaba returned ${sortedEmbeddings.length} embeddings for ` +
          `${values.length} AI SDK embedding value. Use fused embedding mode or ` +
          'pass a single multimodal content item.',
      });
    }

    return {
      warnings: [],
      embeddings: sortedEmbeddings.map(item => item.embedding),
      usage: response.usage
        ? { tokens: response.usage.total_tokens }
        : undefined,
      providerMetadata: {
        alibaba: {
          requestId: response.request_id,
          embeddingTypes: sortedEmbeddings.map(item => item.type),
        },
      },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

const alibabaTextEmbeddingSparseEmbeddingSchema = z.object({
  index: z.number(),
  value: z.number(),
  token: z.string().nullish(),
});

const alibabaTextEmbeddingResponseSchema = z.object({
  output: z.object({
    embeddings: z.array(
      z.object({
        embedding: z.array(z.number()),
        text_index: z.number(),
        sparse_embedding: z
          .array(alibabaTextEmbeddingSparseEmbeddingSchema)
          .nullish(),
      }),
    ),
  }),
  usage: z
    .object({
      total_tokens: z.number(),
    })
    .nullish(),
});

const alibabaMultimodalEmbeddingResponseSchema = z.object({
  request_id: z.string().nullish(),
  output: z.object({
    embeddings: z.array(
      z.object({
        index: z.number(),
        embedding: z.array(z.number()),
        type: z.string(),
      }),
    ),
  }),
  usage: z
    .object({
      total_tokens: z.number(),
      input_tokens: z.number().nullish(),
      output_tokens: z.number().nullish(),
      input_tokens_details: z
        .object({
          image_tokens: z.number().nullish(),
          text_tokens: z.number().nullish(),
        })
        .nullish(),
      image_tokens: z.number().nullish(),
      image_count: z.number().nullish(),
      duration: z.number().nullish(),
    })
    .nullish(),
});
