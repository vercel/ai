import { RerankingModelV3 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { cohereFailedResponseHandler } from '../cohere-error';
import {
  CohereRerankingInput,
  cohereRerankingResponseSchema,
} from './cohere-reranking-api';
import {
  CohereRerankingModelId,
  cohereRerankingOptionsSchema,
} from './cohere-reranking-options';

type CohereRerankingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class CohereRerankingModel implements RerankingModelV3 {
  readonly specificationVersion = 'v3';
  readonly modelId: CohereRerankingModelId;

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
      provider: 'cohere',
      providerOptions,
      schema: cohereRerankingOptionsSchema,
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
        query,
        documents:
          documents.type === 'text'
            ? documents.values
            : documents.values.map(value => JSON.stringify(value)),
        top_n: topK,
        max_tokens_per_doc: rerankingOptions?.maxTokensPerDoc,
        priority: rerankingOptions?.priority,
      } satisfies CohereRerankingInput,
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cohereRerankingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      ranking: response.results.map(result => ({
        index: result.index,
        relevanceScore: result.relevance_score,
      })),
      providerMetadata: {
        cohere: response.meta,
      },
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}
