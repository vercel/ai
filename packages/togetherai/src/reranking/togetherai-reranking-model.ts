import { RerankingModelV3 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import {
  togetheraiErrorSchema,
  TogetherAIRerankingInput,
  togetheraiRerankingResponseSchema,
} from './togetherai-reranking-api';
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
    topN,
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

    const {
      responseHeaders,
      value: response,
      rawValue,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/rerank`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        documents: documents.values,
        query,
        top_n: topN,
        rank_fields: rerankingOptions?.rankFields,
        return_documents: false, // reduce response size
      } satisfies TogetherAIRerankingInput,
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
