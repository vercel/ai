import { RerankingModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { voyageFailedResponseHandler } from '../voyage-error';
import {
  VoyageRerankingInput,
  voyageRerankingResponseSchema,
} from './voyage-reranking-api';
import {
  VoyageRerankingModelId,
  voyageRerankingOptionsSchema,
} from './voyage-reranking-options';

type VoyageRerankingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class VoyageRerankingModel implements RerankingModelV3 {
  readonly specificationVersion = 'v3';
  readonly modelId: VoyageRerankingModelId;

  private readonly config: VoyageRerankingConfig;

  constructor(modelId: VoyageRerankingModelId, config: VoyageRerankingConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

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
      provider: 'voyage',
      providerOptions,
      schema: voyageRerankingOptionsSchema,
    });

    const warnings: SharedV3Warning[] = [];

    if (documents.type === 'object') {
      warnings.push({
        type: 'compatibility',
        feature: 'object documents',
        details: 'Object documents are converted to strings.',
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
        query,
        documents:
          documents.type === 'text'
            ? documents.values
            : documents.values.map(value => JSON.stringify(value)),
        top_k: topN,
        truncation: rerankingOptions?.truncation,
      } satisfies VoyageRerankingInput,
      failedResponseHandler: voyageFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        voyageRerankingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      ranking: response.data.map(result => ({
        index: result.index,
        relevanceScore: result.relevance_score,
      })),
      warnings,
      response: {
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}
