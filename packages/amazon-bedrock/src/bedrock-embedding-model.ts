import { EmbeddingModelV1, EmbeddingModelV1Embedding } from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import {
  BedrockEmbeddingModelId,
  BedrockEmbeddingSettings,
} from './bedrock-embedding-settings';
import { BedrockErrorSchema } from './bedrock-error';
import { z } from 'zod';

type BedrockEmbeddingConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

type DoEmbedResponse = Awaited<ReturnType<EmbeddingModelV1<string>['doEmbed']>>;

export class BedrockEmbeddingModel implements EmbeddingModelV1<string> {
  readonly specificationVersion = 'v1';
  readonly provider = 'amazon-bedrock';
  readonly maxEmbeddingsPerCall = undefined;
  readonly supportsParallelCalls = true;

  constructor(
    readonly modelId: BedrockEmbeddingModelId,
    private readonly settings: BedrockEmbeddingSettings,
    private readonly config: BedrockEmbeddingConfig,
  ) {}

  private getUrl(modelId: string): string {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/invoke`;
  }

  private isCohereModel(): boolean {
    return this.modelId.startsWith('cohere.');
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
  }: Parameters<
    EmbeddingModelV1<string>['doEmbed']
  >[0]): Promise<DoEmbedResponse> {
    if (this.isCohereModel()) {
      return this.doCohereEmbed({ values, headers, abortSignal });
    } else {
      return this.doTitanEmbed({ values, headers, abortSignal });
    }
  }

  private async doTitanEmbed({
    values,
    headers,
    abortSignal,
  }: Parameters<
    EmbeddingModelV1<string>['doEmbed']
  >[0]): Promise<DoEmbedResponse> {
    const embedSingleText = async (inputText: string) => {
      // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
      const args = {
        inputText,
        dimensions: this.settings.dimensions,
        normalize: this.settings.normalize,
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
          TitanEmbeddingResponseSchema,
        ),
        fetch: this.config.fetch,
        abortSignal,
      });

      return {
        embedding: response.embedding,
        inputTextTokenCount: response.inputTextTokenCount,
      };
    };

    const responses = await Promise.all(values.map(embedSingleText));
    return responses.reduce<{
      embeddings: EmbeddingModelV1Embedding[];
      usage: { tokens: number };
    }>(
      (accumulated, response) => {
        accumulated.embeddings.push(response.embedding);
        accumulated.usage.tokens += response.inputTextTokenCount;
        return accumulated;
      },
      { embeddings: [], usage: { tokens: 0 } },
    );
  }

  private async doCohereEmbed({
    values,
    headers,
    abortSignal,
  }: Parameters<
    EmbeddingModelV1<string>['doEmbed']
  >[0]): Promise<DoEmbedResponse> {
    const cohere = this.settings.cohere || {};
    const args: Record<string, any> = {
      input_type: cohere.input_type || 'search_document',
      truncate: cohere.truncate || 'NONE',
      embedding_types: cohere.embedding_types || ['float'],
    };

    // Either use images or texts, but not both
    if (cohere.images && cohere.input_type === 'image') {
      args.images = cohere.images;
    } else {
      args.texts = values;
    }

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
        CohereEmbeddingResponseSchema,
      ),
      fetch: this.config.fetch,
      abortSignal,
    });

    // Extract embeddings from Cohere response
    let embeddings: number[][] = [];

    // Handle different response formats based on embedding_types
    // If multiple embedding_types are requested, the response contains an object with embeddings
    // keyed by type (e.g., {"float": [...], "int8": [...]})
    if (response.embeddings && Array.isArray(response.embeddings)) {
      // Simple case: single embedding type returns an array of embeddings directly
      embeddings = response.embeddings;
    } else if (typeof response.embeddings === 'object') {
      // Complex case: multiple embedding types returns an object with embeddings keyed by type
      // We'll use the 'float' embeddings if available, otherwise take the first type's embeddings
      const embeddingTypes = Object.keys(response.embeddings);
      const preferredType = embeddingTypes.includes('float')
        ? 'float'
        : embeddingTypes[0];
      embeddings = response.embeddings[preferredType] || [];
    }

    // Cohere doesn't provide token count in the response
    // Instead, estimate 1 token per 4 characters as mentioned in the docs
    const tokenEstimate = values.reduce(
      (sum, text) => sum + Math.ceil(text.length / 4),
      0,
    );

    return {
      embeddings,
      usage: { tokens: tokenEstimate },
    };
  }
}

const TitanEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
  inputTextTokenCount: z.number(),
});

// Handle both simple and complex embedding response formats
const CohereEmbeddingResponseSchema = z.object({
  // For single embedding type (the default)
  embeddings: z.union([
    // For single embedding type: array of embeddings
    z.array(z.array(z.number())),
    // For multiple embedding types: object with embeddings keyed by type
    z.record(z.string(), z.array(z.array(z.number()))),
  ]),
  id: z.string(),
  response_type: z.string(),
  texts: z.array(z.string()).optional(),
});
