import {
  RerankingModelV3,
  TooManyDocumentsForRerankingError,
} from '@ai-sdk/provider';

import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';

import { z } from 'zod/v4';
import {
  TogetherAIRerankingModelId,
  togetheraiRerankingOptions,
} from './togetherai-reranking-options';

type TogetherAIRerankingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class TogetherAIRerankingModel implements RerankingModelV3 {
  readonly specificationVersion = 'v3';
  readonly modelId: TogetherAIRerankingModelId;

  readonly maxDocumentsPerCall = Infinity;

  private readonly config: TogetherAIRerankingConfig;

  constructor(
    modelId: TogetherAIRerankingModelId,
    config: TogetherAIRerankingConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  // see https://docs.together.ai/reference/rerank-1
  async doRerank({
    documents,
    headers,
    query,
    topK,
    abortSignal,
    providerOptions,
  }: Parameters<RerankingModelV3['doRerank']>[0]): Promise<
    Awaited<ReturnType<RerankingModelV3['doRerank']>>
  > {
    const rerankingOptions = await parseProviderOptions({
      provider: 'togetherai',
      providerOptions,
      schema: togetheraiRerankingOptions,
    });

    if (documents.values.length > this.maxDocumentsPerCall) {
      throw new TooManyDocumentsForRerankingError({
        provider: this.provider,
        modelId: this.modelId,
        maxDocumentsPerCall: this.maxDocumentsPerCall,
        documentsCount: documents.values.length,
      });
    }

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/rerank`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        documents: values,
        query: query,
        top_n: topK,
        rank_fields: rerankingOptions?.rankFields,
      },
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: togetheraiErrorSchema,
        errorToMessage: data => data.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        togetheraiRerankingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      rerankedDocuments: response.results.map(result => ({
        index: result.index,
        relevanceScore: result.relevance_score,
        document: values[result.index],
      })),
      usage: {
        tokens: response.usage.total_tokens,
      },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

const togetheraiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const togetheraiRerankingResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  object: z.literal('rerank'),
  results: z.array(
    z.object({
      index: z.number(),
      relevance_score: z.number(),
    }),
  ),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});
