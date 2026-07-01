import {
  TooManyEmbeddingValuesForCallError,
  type EmbeddingModelV3,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  amazonBedrockEmbeddingModelOptionsSchema,
  type BedrockEmbeddingModelId,
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
  readonly supportsParallelCalls = true;

<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-embedding-model.ts
=======
  get maxEmbeddingsPerCall() {
    return isCohereEmbeddingModel(this.modelId) ? 96 : 1;
  }

  static [WORKFLOW_SERIALIZE](model: AmazonBedrockEmbeddingModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: AmazonBedrockEmbeddingConfig;
  }) {
    return new AmazonBedrockEmbeddingModel(options.modelId, options.config);
  }

>>>>>>> 1daf48becd (feat(amazon-bedrock): increase limit of embeddings in a request for cohere models (#16559)):packages/amazon-bedrock/src/amazon-bedrock-embedding-model.ts
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
        schema: amazonBedrockEmbeddingModelOptionsSchema,
      })) ?? {};

    // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
    //
    // Note: Different embedding model families expect different request/response
    // payloads (e.g. Titan vs Cohere vs Nova). We keep the public interface stable and
    // adapt here based on the modelId.
    const isNovaModel = isNovaEmbeddingModel(this.modelId);
    const isCohereModel = isCohereEmbeddingModel(this.modelId);

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
<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-embedding-model.ts
            input_type: bedrockOptions.inputType ?? 'search_query',
            texts: [values[0]],
            truncate: bedrockOptions.truncate,
            output_dimension: bedrockOptions.outputDimension,
=======
            input_type: amazonBedrockOptions.inputType ?? 'search_query',
            texts: values,
            truncate: amazonBedrockOptions.truncate,
            output_dimension: amazonBedrockOptions.outputDimension,
>>>>>>> 1daf48becd (feat(amazon-bedrock): increase limit of embeddings in a request for cohere models (#16559)):packages/amazon-bedrock/src/amazon-bedrock-embedding-model.ts
          }
        : {
            inputText: values[0],
            dimensions: bedrockOptions.dimensions,
            normalize: bedrockOptions.normalize,
          };

    const url = this.getUrl(this.modelId);
    const { value: response, responseHeaders } = await postJsonToApi({
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

    // Extract embeddings based on response format
    let embeddings: number[][];
    if ('embedding' in response) {
      // Titan response
      embeddings = [response.embedding];
    } else if (Array.isArray(response.embeddings)) {
      const firstEmbedding = response.embeddings[0];
      if (
        typeof firstEmbedding === 'object' &&
        firstEmbedding !== null &&
        'embeddingType' in firstEmbedding
      ) {
        // Nova response
        embeddings = [firstEmbedding.embedding];
      } else {
        // Cohere v3 response
        embeddings = response.embeddings as number[][];
      }
    } else {
      // Cohere v4 response
      embeddings = response.embeddings.float;
    }

    // Extract token count based on response format
    const headerTokenCount = Number(
      responseHeaders?.['x-amzn-bedrock-input-token-count'],
    );
    const tokens =
      'inputTextTokenCount' in response
        ? response.inputTextTokenCount // Titan response
        : 'inputTokenCount' in response
          ? (response.inputTokenCount ?? 0) // Nova response
          : headerTokenCount;

    return {
      embeddings,
      usage: { tokens },
      warnings: [],
    };
  }
}

<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-embedding-model.ts
const BedrockEmbeddingResponseSchema = z.union([
=======
function isCohereEmbeddingModel(modelId: string) {
  // Use `includes` so cross-region inference profile ids (e.g.
  // `us.cohere.embed-v4:0`, `global.cohere.embed-v4:0`) are detected too.
  return modelId.includes('cohere.embed-');
}

function isNovaEmbeddingModel(modelId: string) {
  return modelId.startsWith('amazon.nova-') && modelId.includes('embed');
}

const AmazonBedrockEmbeddingResponseSchema = z.union([
>>>>>>> 1daf48becd (feat(amazon-bedrock): increase limit of embeddings in a request for cohere models (#16559)):packages/amazon-bedrock/src/amazon-bedrock-embedding-model.ts
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
