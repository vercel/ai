import {
  RerankingModelV2,
  TooManyDocumentsForRerankingError,
} from '@ai-sdk/provider';

import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';

import { z } from 'zod/v4';
import { cohereFailedResponseHandler } from './cohere-error';
import {
  CohereRerankingModelId,
  cohereRerankingOptions,
} from './cohere-reranking-options';

type CohereRerankingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class CohereRerankingModel implements RerankingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly modelId: CohereRerankingModelId;

  readonly maxDocumentsPerCall = Infinity;

  private readonly config: CohereRerankingConfig;

  constructor(modelId: CohereRerankingModelId, config: CohereRerankingConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  // current implementation is based on v2 of the API: https://docs.cohere.com/v2/reference/rerank
  async doRerank({
    values,
    headers,
    query,
    topK,
    abortSignal,
    providerOptions,
  }: Parameters<RerankingModelV2<string>['doRerank']>[0]): Promise<
    Awaited<ReturnType<RerankingModelV2<string>['doRerank']>>
  > {
    const embeddingOptions = await parseProviderOptions({
      provider: 'cohere',
      providerOptions,
      schema: cohereRerankingOptions,
    });

    // The total max chunks (length of documents * max_chunks_per_doc) must be less than 10000.
    if (values.length > this.maxDocumentsPerCall) {
      throw new TooManyDocumentsForRerankingError({
        provider: this.provider,
        modelId: this.modelId,
        maxDocumentsPerCall: this.maxDocumentsPerCall,
        documents: values,
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
        max_tokens_per_doc: embeddingOptions?.maxTokensPerDoc ?? 4096,
      },
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cohereRerankingResponseSchema,
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
      usage: { tokens: response.meta.billed_units.search_units },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereRerankingResponseSchema = z.object({
  id: z.string(),
  results: z.array(
    z.object({
      index: z.number(),
      relevance_score: z.number(),
    }),
  ),
  meta: z.object({
    api_version: z.object({
      version: z.string(),
    }),
    billed_units: z.object({
      search_units: z.number(),
    }),
  }),
});
