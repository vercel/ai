import {
  type RerankingModelV4,
  type RerankingModelV4CallOptions,
  type RerankingModelV4Result,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { nebulFailedResponseHandler } from './nebul-error';
import type { NebulRerankingModelId } from './nebul-reranking-options';

export type NebulRerankingModelConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

const nebulRerankingResponseSchema = z.object({
  id: z.string().nullish(),
  model: z.string().nullish(),
  results: z.array(
    z.object({
      index: z.number(),
      relevance_score: z.number(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      total_tokens: z.number(),
    })
    .nullish(),
});

export class NebulRerankingModel implements RerankingModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: NebulRerankingModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: NebulRerankingModelId;
    config: NebulRerankingModelConfig;
  }) {
    return new NebulRerankingModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: NebulRerankingModelId,
    private readonly config: NebulRerankingModelConfig,
  ) {}

  async doRerank(
    options: RerankingModelV4CallOptions,
  ): Promise<RerankingModelV4Result> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/rerank`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: {
        model: this.modelId,
        query: options.query,
        documents:
          options.documents.type === 'text'
            ? options.documents.values
            : options.documents.values.map(value => JSON.stringify(value)),
        ...(options.topN != null && { top_n: options.topN }),
      },
      failedResponseHandler: nebulFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        nebulRerankingResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      ranking: response.results.map(result => ({
        index: result.index,
        relevanceScore: result.relevance_score,
      })),
      response: {
        id: response.id ?? undefined,
        timestamp: currentDate,
        modelId: response.model ?? this.modelId,
        headers: responseHeaders,
        body: response,
      },
    };
  }
}
