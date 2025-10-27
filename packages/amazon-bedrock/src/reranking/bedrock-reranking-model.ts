import { RerankingModelV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { BedrockErrorSchema } from '../bedrock-error';
import { bedrockRerankingResponseSchema } from './bedrock-reranking-api';
import {
  BedrockRerankingModelId,
  bedrockRerankingProviderOptions,
} from './bedrock-reranking-options';

type BedrockRerankingConfig = {
  baseUrl: () => string;
  region: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

type DoRerankResponse = Awaited<ReturnType<RerankingModelV3['doRerank']>>;

export class BedrockRerankingModel implements RerankingModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'amazon-bedrock';

  constructor(
    readonly modelId: BedrockRerankingModelId,
    private readonly config: BedrockRerankingConfig,
  ) {}

  async doRerank({
    documents,
    headers,
    query,
    topN,
    abortSignal,
    providerOptions,
  }: Parameters<RerankingModelV3['doRerank']>[0]): Promise<DoRerankResponse> {
    const bedrockOptions =
      (await parseProviderOptions({
        provider: 'bedrock',
        providerOptions,
        schema: bedrockRerankingProviderOptions,
      })) ?? {};

    const sources = documents.values.map(value => ({
      inlineDocumentSource:
        documents.type === 'text'
          ? {
              type: 'TEXT',
              textDocument: { text: value },
            }
          : {
              type: 'JSON',
              jsonDocument: value,
            },
      type: 'INLINE',
    }));

    // Prepare the request body according to AWS Bedrock Rerank API
    // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Rerank.html
    const args = {
      nextToken: bedrockOptions.nextToken,
      queries: [
        {
          textQuery: { text: query },
          type: 'TEXT',
        },
      ],
      rerankingConfiguration: {
        bedrockRerankingConfiguration: {
          modelConfiguration: {
            modelArn: `arn:aws:bedrock:${this.config.region}::foundation-model/${this.modelId}`,
            additionalModelRequestFields:
              bedrockOptions.additionalModelRequestFields ?? {},
          },
          numberOfResults: topN,
        },
        type: 'BEDROCK_RERANKING_MODEL',
      },
      sources,
    };

    // Use agent runtime API for reranking
    const url = `${this.config.baseUrl()}/rerank`;

    const {
      value: response,
      responseHeaders,
      rawValue,
    } = await postJsonToApi({
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
        bedrockRerankingResponseSchema,
      ),
      fetch: this.config.fetch,
      abortSignal,
    });

    return {
      ranking: response.results.map(result => ({
        index: result.index,
        relevanceScore: result.relevanceScore,
      })),
      response: {
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}
