import { RerankingModelV1DocumentIndex } from '@ai-sdk/provider';
import { retryWithExponentialBackoff } from '../../util/retry-with-exponential-backoff';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { RerankingModel } from '../types';
import { splitArray } from '../util/split-array';
import { RerankResult } from './rerank-result';

/**
Rerank documents using an reranking model. The type of the value is defined by the reranking model.

@param model - The Reranking model to use.
@param values - The documents that should be reranking.
@param query - The query is a string that represents the query to rerank the documents against.
@param topK - Top k documents to rerank.
@param returnDocuments - Return the reranked documents in the response (In same order as indices).

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the reranked documents, the reranked indices, and additional information.
 */
export async function rerank<VALUE>({
  model,
  values,
  query,
  topK,
  returnDocuments = false,
  maxRetries,
  abortSignal,
  headers,
  experimental_telemetry: telemetry,
}: {
  /**
The reranking model to use.
  */
  model: RerankingModel<VALUE>;

  /**
The documents that should be reranked.
   */
  values: Array<VALUE>;

  /**
The query is a string that represents the query to rerank the documents against.
   */
  query: string;

  /**
Top k documents to rerank.
  */
  topK: number;

  /**
Return the reranked documents in the response (In same order as indices).

@default false
   */
  returnDocuments?: boolean;

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
}): Promise<RerankResult<VALUE>> {
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
        'ai.values': { input: () => JSON.stringify(values) },
      },
    }),
    tracer,
    fn: async span => {
      const retry = retryWithExponentialBackoff({ maxRetries });
      const maxDocumentsPerCall = model.maxDocumentsPerCall;

      if (maxDocumentsPerCall == null) {
        const { rerankedIndices, usage, rerankedDocuments, rawResponse } =
          await retry(() =>
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
                  'ai.values': { input: () => [JSON.stringify(values)] },
                },
              }),
              tracer,
              fn: async doRerankSpan => {
                const modelResponse = await model.doRerank({
                  values,
                  query,
                  topK,
                  returnDocuments,
                  abortSignal,
                  headers,
                });

                const rerankedIndices = modelResponse.rerankedIndices;
                const usage = modelResponse.usage ?? { tokens: NaN };
                const rerankedDocuments = modelResponse.rerankedDocuments ?? [];

                doRerankSpan.setAttributes(
                  selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.rerankedIndices': {
                        output: () => JSON.stringify(rerankedIndices),
                      },
                      'ai.usage.tokens': usage.tokens,
                      'ai.rerankedDocuments': {
                        output: () => JSON.stringify(rerankedDocuments),
                      },
                    },
                  }),
                );

                return {
                  rerankedIndices,
                  usage,
                  rerankedDocuments,
                  rawResponse: modelResponse.rawResponse,
                };
              },
            }),
          );

        span.setAttributes(
          selectTelemetryAttributes({
            telemetry,
            attributes: {
              'ai.rerankedIndices': {
                output: () => JSON.stringify(rerankedIndices),
              },
              'ai.rerankedDocuments': {
                output: () => JSON.stringify(rerankedDocuments),
              },
              'ai.usage.tokens': usage.tokens,
            },
          }),
        );

        return new DefaultRerankResult({
          values,
          rerankedIndices,
          rerankedDocuments,
          usage,
          rawResponse,
        });
      }

      // split the values into chunks that are small enough for the model:
      const valueChunks = splitArray(values, maxDocumentsPerCall);

      const rerankedIndices: Array<RerankingModelV1DocumentIndex> = [];
      const rerankedDocuments: Array<VALUE> = [];
      let tokens = 0;

      for (const chunk of valueChunks) {
        const {
          rerankedIndices: chunkIndices,
          rerankedDocuments: chunkedRerankedDocuments,
          usage,
        } = await retry(() =>
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
                'ai.values': { input: () => [JSON.stringify(chunk)] },
              },
            }),
            tracer,
            fn: async doRerankSpan => {
              const modelResponse = await model.doRerank({
                values: chunk,
                query,
                topK,
                returnDocuments,
                abortSignal,
                headers,
              });

              const chunkIndices = modelResponse.rerankedIndices;
              const usage = modelResponse.usage ?? { tokens: NaN };
              const chunkedRerankedDocuments =
                modelResponse.rerankedDocuments ?? [];

              doRerankSpan.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'ai.rerankedIndices': {
                      output: () => JSON.stringify(chunkIndices),
                    },
                    'ai.usage.tokens': usage.tokens,
                    'ai.rerankedDocuments': {
                      output: () => JSON.stringify(chunkedRerankedDocuments),
                    },
                  },
                }),
              );

              return {
                rerankedIndices: chunkIndices,
                usage,
                rerankedDocuments: chunkedRerankedDocuments,
              };
            },
          }),
        );

        rerankedIndices.push(...chunkIndices);
        rerankedDocuments.push(...chunkedRerankedDocuments);
        tokens += usage.tokens;
      }

      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.rerankedIndices': {
              output: () => JSON.stringify(rerankedIndices),
            },
            'ai.rerankedDocuments': {
              output: () => JSON.stringify(rerankedDocuments),
            },
            'ai.usage.tokens': tokens,
          },
        }),
      );

      return new DefaultRerankResult({
        values,
        rerankedIndices,
        rerankedDocuments,
        usage: { tokens },
      });
    },
  });
}

class DefaultRerankResult<VALUE> implements RerankResult<VALUE> {
  readonly documents: RerankResult<VALUE>['documents'];
  readonly rerankedIndices: RerankResult<VALUE>['rerankedIndices'];
  readonly rerankedDocuments: RerankResult<VALUE>['documents'];
  readonly usage: RerankResult<VALUE>['usage'];
  readonly rawResponse: RerankResult<VALUE>['rawResponse'];

  constructor(options: {
    values: RerankResult<VALUE>['documents'];
    rerankedIndices: RerankResult<VALUE>['rerankedIndices'];
    rerankedDocuments: RerankResult<VALUE>['documents'];
    usage: RerankResult<VALUE>['usage'];
    rawResponse?: RerankResult<VALUE>['rawResponse'];
  }) {
    this.documents = options.values;
    this.rerankedIndices = options.rerankedIndices;
    this.rerankedDocuments = options.rerankedDocuments;
    this.usage = options.usage;
    this.rawResponse = options.rawResponse;
  }
}
