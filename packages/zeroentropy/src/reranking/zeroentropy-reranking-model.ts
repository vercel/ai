import { RerankingModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { zeroEntropyFailedResponseHandler } from '../zeroentropy-error';
import {
  ZeroEntropyRerankingModelId,
  zeroEntropyRerankingModelOptionsSchema,
} from './zeroentropy-reranking-options';

type ZeroEntropyRerankingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class ZeroEntropyRerankingModel implements RerankingModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: ZeroEntropyRerankingModelId;

  private readonly config: ZeroEntropyRerankingConfig;

  constructor(
    modelId: ZeroEntropyRerankingModelId,
    config: ZeroEntropyRerankingConfig,
  ) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  // https://docs.zeroentropy.dev/api-reference/
  async doRerank({
    documents,
    headers,
    query,
    topN,
    abortSignal,
    providerOptions,
  }: Parameters<RerankingModelV4['doRerank']>[0]): Promise<
    Awaited<ReturnType<RerankingModelV4['doRerank']>>
  > {
    const rerankingOptions = await parseProviderOptions({
      provider: 'zeroentropy',
      providerOptions,
      schema: zeroEntropyRerankingModelOptionsSchema,
    });

    const warnings: SharedV4Warning[] = [];

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
      url: `${this.config.baseURL}/models/rerank`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        query,
        documents:
          documents.type === 'text'
            ? documents.values
            : documents.values.map(value => JSON.stringify(value)),
        top_n: topN,
        ...(rerankingOptions?.latency != null && {
          latency: rerankingOptions.latency,
        }),
      },
      failedResponseHandler: zeroEntropyFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        zeroEntropyRerankingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      ranking: response.results.map(result => ({
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

// minimal version of the schema, focused on what is needed for the implementation
const zeroEntropyRerankingResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      relevance_score: z.number(),
    }),
  ),
});
