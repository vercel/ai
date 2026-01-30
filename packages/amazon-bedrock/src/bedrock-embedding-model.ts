import {
  EmbeddingModelV3,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import {
  BedrockEmbeddingModelId,
  bedrockEmbeddingProviderOptions,
} from './bedrock-embedding-options';
import { BedrockErrorSchema } from './bedrock-error';
import { z } from 'zod/v4';

type BedrockEmbeddingConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

type DoEmbedResponse = Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>;

export class BedrockEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'amazon-bedrock';
  readonly maxEmbeddingsPerCall = 1;
  readonly supportsParallelCalls = true;

  constructor(
    readonly modelId: BedrockEmbeddingModelId,
    private readonly config: BedrockEmbeddingConfig,
  ) {}

  private getUrl(modelId: string): string {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/invoke`;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV3['doEmbed']>[0]): Promise<DoEmbedResponse> {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values,
      });
    }

    // Parse provider options
    const bedrockOptions =
      (await parseProviderOptions({
        provider: 'bedrock',
        providerOptions,
        schema: bedrockEmbeddingProviderOptions,
      })) ?? {};

    // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
    //
    // Note: Different embedding model families expect different request/response
    // payloads (e.g. Titan vs Cohere vs Nova). We keep the public interface stable and
    // adapt here based on the modelId.
    const isNovaModel =
      this.modelId.startsWith('amazon.nova-') && this.modelId.includes('embed');
    const isCohereModel = this.modelId.startsWith('cohere.embed-');

    const args = isNovaModel
      ? {
          taskType: 'SINGLE_EMBEDDING',
          singleEmbeddingParams: {
            embeddingPurpose:
              bedrockOptions.embeddingPurpose ?? 'GENERIC_INDEX',
            embeddingDimension: bedrockOptions.embeddingDimension ?? 1024,
            text: {
              truncationMode: bedrockOptions.truncate ?? 'END',
              value: values[0],
            },
          },
        }
      : isCohereModel
        ? {
            // Cohere embedding models on Bedrock require `input_type`.
            // Without it, the service attempts other schema branches and rejects the request.
            input_type: bedrockOptions.inputType ?? 'search_query',
            texts: [values[0]],
            truncate: bedrockOptions.truncate,
            output_dimension: bedrockOptions.outputDimension,
          }
        : {
            inputText: values[0],
            dimensions: bedrockOptions.dimensions,
            normalize: bedrockOptions.normalize,
          };

    const url = this.getUrl(this.modelId);
    const { value: response } = await postJsonToApi({
      url,
      headers: await resolve(
        combineHeaders(await resolve(this.config.headers), headers),
      ),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: BedrockErrorSchema,
        errorToMessage: error => `${error.type}: ${error.message}`,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        BedrockEmbeddingResponseSchema,
      ),
      fetch: this.config.fetch,
      abortSignal,
    });

    // Extract embedding based on response format
    let embedding: number[];
    if ('embedding' in response) {
      // Titan response
      embedding = response.embedding;
    } else if (Array.isArray(response.embeddings)) {
      const firstEmbedding = response.embeddings[0];
      if (
        typeof firstEmbedding === 'object' &&
        firstEmbedding !== null &&
        'embeddingType' in firstEmbedding
      ) {
        // Nova response
        embedding = firstEmbedding.embedding;
      } else {
        // Cohere v3 response
        embedding = firstEmbedding as number[];
      }
    } else {
      // Cohere v4 response
      embedding = response.embeddings.float[0];
    }

    // Extract token count based on response format
    const tokens =
      'inputTextTokenCount' in response
        ? response.inputTextTokenCount // Titan response
        : 'inputTokenCount' in response
          ? (response.inputTokenCount ?? 0) // Nova response
          : NaN; // Cohere doesn't return token count

    return {
      embeddings: [embedding],
      usage: { tokens },
      warnings: [],
    };
  }
}

const BedrockEmbeddingResponseSchema = z.union([
  // Titan-style response
  z.object({
    embedding: z.array(z.number()),
    inputTextTokenCount: z.number(),
  }),
  // Nova-style response
  z.object({
    embeddings: z.array(
      z.object({
        embeddingType: z.string(),
        embedding: z.array(z.number()),
      }),
    ),
    inputTokenCount: z.number().optional(),
  }),
  // Cohere v3-style response
  z.object({
    embeddings: z.array(z.array(z.number())),
  }),
  // Cohere v4-style response
  z.object({
    embeddings: z.object({
      float: z.array(z.array(z.number())),
    }),
  }),
]);
