import {
  RerankingModelV2,
  TooManyDocumentsForRerankingError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
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
import {
  BedrockRerankingModelId,
  bedrockRerankingProviderOptions,
} from './bedrock-reranking-options';
import { BedrockErrorSchema } from './bedrock-error';
import { z } from 'zod/v4';

type BedrockRerankingConfig = {
  baseUrl: () => string;
  region: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
};

type DoRerankResponse = Awaited<
  ReturnType<RerankingModelV2<string | object>['doRerank']>
>;

export class BedrockRerankingModel
  implements RerankingModelV2<string | object>
{
  readonly specificationVersion = 'v2';
  readonly provider = 'amazon-bedrock';
  readonly maxDocumentsPerCall = 1000;

  constructor(
    readonly modelId: BedrockRerankingModelId,
    private readonly config: BedrockRerankingConfig,
  ) {}

  async doRerank({
    values,
    headers,
    query,
    topK,
    abortSignal,
    providerOptions,
  }: Parameters<
    RerankingModelV2<string | object>['doRerank']
  >[0]): Promise<DoRerankResponse> {
    if (values.length > this.maxDocumentsPerCall) {
      throw new TooManyDocumentsForRerankingError({
        provider: this.provider,
        modelId: this.modelId,
        maxDocumentsPerCall: this.maxDocumentsPerCall,
        documents: values,
      });
    }
    // only cohere model supports json documents (values)
    if (
      typeof values[0] === 'object' &&
      this.modelId !== 'cohere.rerank-v3-5:0'
    ) {
      throw new UnsupportedFunctionalityError({
        functionality: 'JSON documents',
        message: 'Only Cohere model supports JSON documents',
      });
    }

    // Parse provider options
    const bedrockOptions =
      (await parseProviderOptions({
        provider: 'bedrock',
        providerOptions,
        schema: bedrockRerankingProviderOptions,
      })) ?? {};

    // Prepare sources array - convert values to the expected format
    const sources = values.map(value => {
      if (typeof value === 'string') {
        return {
          inlineDocumentSource: {
            type: 'TEXT',
            textDocument: {
              text: value,
            },
          },
          type: 'INLINE',
        };
      } else {
        return {
          inlineDocumentSource: {
            type: 'JSON',
            jsonDocument: value,
          },
          type: 'INLINE',
        };
      }
    });

    // Prepare the request body according to AWS Bedrock Rerank API
    // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Rerank.html
    const args = {
      nextToken: bedrockOptions.nextToken,
      queries: [
        {
          textQuery: {
            text: query,
          },
          type: 'TEXT',
        },
      ],
      rerankingConfiguration: {
        bedrockRerankingConfiguration: {
          modelConfiguration: {
            modelArn: `arn:aws:bedrock:${this.config.region}::foundation-model/${this.modelId}`,
            additionalModelRequestFields:
              bedrockOptions.additionalModelRequestFields || {},
          },
          numberOfResults: topK,
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
        BedrockRerankingResponseSchema,
      ),
      fetch: this.config.fetch,
      abortSignal,
    });

    return {
      rerankedDocuments: response.results.map((result: any) => ({
        index: result.index,
        relevanceScore: result.relevanceScore,
        document: values[result.index],
      })),
      response: { headers: responseHeaders, body: rawValue },
    };
  }
}

// Response schema for Bedrock Rerank API
const BedrockRerankingResponseSchema = z.object({
  results: z.array(
    z.object({
      document: z
        .object({
          textDocument: z
            .object({
              text: z.string(),
            })
            .optional(),
          jsonDocument: z.any().optional(),
          type: z.string(),
        })
        .optional(),
      index: z.number(),
      relevanceScore: z.number(),
    }),
  ),
  nextToken: z.string().optional(),
});
