import { JSONObject } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { prepareRetries } from '../../src/util/prepare-retries';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { RerankingModel } from '../types';
import { RerankResult } from './rerank-result';

/**
Rerank documents using an reranking model. The type of the value is defined by the reranking model.

@param model - The Reranking model to use.
@param documents - The documents that should be reranking.
@param query - The query is a string that represents the query to rerank the documents against.
@param topK - Top k documents to rerank.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the reranked documents, the reranked indices, and additional information.
 */
export async function rerank<VALUE extends JSONObject | string>({
  model,
  documents,
  query,
  topN,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  providerOptions,
  experimental_telemetry: telemetry,
}: {
  /**
The reranking model to use.
  */
  model: RerankingModel;

  /**
   * The documents that should be reranked.
   */
  documents: Array<VALUE>;

  /**
The query is a string that represents the query to rerank the documents against.
   */
  query: string;

  /**
   * Number of top documents to return.
   */
  topN: number;

  /**
Maximum number of retries per reranking model call. Set to 0 to disable retries.

@default 2
   */
  maxRetries?: number;

  /**
Abort signal.
 */
  abortSignal?: AbortSignal;

  /**
Additional headers to include in the request.
Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string>;

  /**
   * Optional telemetry configuration (experimental).
   */
  experimental_telemetry?: TelemetrySettings;

  /**
    Additional provider-specific options. They are passed through
    to the provider from the AI SDK and enable provider-specific
    functionality that can be fully encapsulated in the provider.
    */
  providerOptions?: ProviderOptions;
}): Promise<RerankResult<VALUE>> {
  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { maxRetries },
  });

  const tracer = getTracer(telemetry);

  return recordSpan({
    name: 'ai.rerank',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({ operationId: 'ai.rerank', telemetry }),
        ...baseTelemetryAttributes,
        'ai.documents': { input: () => documents.map(v => JSON.stringify(v)) },
      },
    }),
    tracer,
    fn: async () => {
      const { ranking, response, providerMetadata } = await retry(() =>
        recordSpan({
          name: 'ai.rerank.doRerank',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              ...assembleOperationName({
                operationId: 'ai.rerank.doRerank',
                telemetry,
              }),
              ...baseTelemetryAttributes,
              // specific settings that only make sense on the outer level:
              'ai.documents': {
                input: () =>
                  documents.map(document => JSON.stringify(document)),
              },
            },
          }),
          tracer,
          fn: async doRerankSpan => {
            const modelResponse = await model.doRerank({
              // if all documents are strings, we can use text mode, otherwise json mode
              documents: documents.every(
                document => typeof document === 'string',
              )
                ? { type: 'text', values: documents }
                : { type: 'object', values: documents },
              query,
              topN,
              providerOptions,
              abortSignal,
              headers,
            });

            const ranking = modelResponse.ranking;

            doRerankSpan.setAttributes(
              await selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.ranking.type': documents.every(
                    document => typeof document === 'string',
                  )
                    ? 'text'
                    : 'json',
                  'ai.ranking': {
                    output: () =>
                      ranking.map(ranking => JSON.stringify(ranking)),
                  },
                },
              }),
            );

            return {
              ranking,
              providerMetadata: modelResponse.providerMetadata,
              response: modelResponse.response,
            };
          },
        }),
      );

      return new DefaultRerankResult({
        originalDocuments: documents,
        ranking: ranking.map(ranking => ({
          originalIndex: ranking.index,
          relevanceScore: ranking.relevanceScore,
          document: documents[ranking.index],
        })),
        providerMetadata,
        response,
      });
    },
  });
}

class DefaultRerankResult<VALUE> implements RerankResult<VALUE> {
  readonly originalDocuments: RerankResult<VALUE>['originalDocuments'];
  readonly ranking: RerankResult<VALUE>['ranking'];
  readonly response: RerankResult<VALUE>['response'];
  readonly providerMetadata: RerankResult<VALUE>['providerMetadata'];

  constructor(options: {
    originalDocuments: RerankResult<VALUE>['originalDocuments'];
    ranking: RerankResult<VALUE>['ranking'];
    providerMetadata?: RerankResult<VALUE>['providerMetadata'];
    response?: RerankResult<VALUE>['response'];
  }) {
    this.originalDocuments = options.originalDocuments;
    this.ranking = options.ranking;
    this.response = options.response;
    this.providerMetadata = options.providerMetadata;
  }

  get rerankedDocuments(): RerankResult<VALUE>['rerankedDocuments'] {
    return this.ranking.map(ranking => ranking.document);
  }
}
