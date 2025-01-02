import {
  RerankingModelV1,
  TooManyDocumentsForRerankingError,
} from '@ai-sdk/provider';

import {
  combineHeaders,
  createJsonResponseHandler,
  FetchFunction,
  postJsonToApi,
} from '@ai-sdk/provider-utils';

import { z } from 'zod';
import { cohereFailedResponseHandler } from './cohere-error';
import {
  CohereRerankingModelId,
  CohereRerankingSettings,
} from './cohere-reranking-settings';

type CohereRerankingConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class CohereRerankingModel implements RerankingModelV1<string> {
  readonly specificationVersion = 'v1';
  readonly modelId: CohereRerankingModelId;

  readonly maxDocumentsPerCall = 10000;
  readonly supportsParallelCalls = true;
  readonly returnInput = false;

  private readonly config: CohereRerankingConfig;
  private readonly settings: CohereRerankingSettings;

  constructor(
    modelId: CohereRerankingModelId,
    settings: CohereRerankingSettings,
    config: CohereRerankingConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  // current implementation is based on v1 of the API: https://docs.cohere.com/v1/reference/rerank
  async doRerank({
    values,
    headers,
    query,
    topK,
    returnDocuments,
    abortSignal,
  }: Parameters<RerankingModelV1<string>['doRerank']>[0]): Promise<
    Awaited<ReturnType<RerankingModelV1<string>['doRerank']>>
  > {
    const totalMaxChunks = this.settings.max_chunks_per_document ?? 1;
    // The total max chunks (length of documents * max_chunks_per_doc) must be less than 10000.
    if (values.length * totalMaxChunks > this.maxDocumentsPerCall) {
      throw new TooManyDocumentsForRerankingError({
        provider: this.provider,
        modelId: this.modelId,
        maxDocumentsPerCall: this.maxDocumentsPerCall,
        documents: values,
      });
    }

    const { responseHeaders, value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/rerank`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        documents: values,
        query: query,
        top_n: topK ?? values.length,
        return_documents: returnDocuments,
        max_chunks_per_doc: this.settings.max_chunks_per_document,
      },
      failedResponseHandler: cohereFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cohereRerankingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      rerankedIndices: response.results.map(result => result.index),
      rerankedDocuments: returnDocuments
        ? response.results.map(result => result.document?.text ?? '')
        : undefined,
      usage: { tokens: response.meta.billed_units.input_tokens },
      rawResponse: { headers: responseHeaders },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const cohereRerankingResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      document: z
        .object({
          text: z.string(),
        })
        .catchall(z.any())
        .optional(),
    }),
  ),
  meta: z.object({
    billed_units: z.object({
      input_tokens: z.number(),
    }),
  }),
});
