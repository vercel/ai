import { RerankingModelV2Result } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { prepareRetries } from '../../src/util/prepare-retries';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { RerankingModel } from '../types';
import { splitArray } from '../util/split-array';
import { RerankResult } from './rerank-result';
import { UnsupportedModelVersionError } from '../error';

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
  maxParallelCalls = Infinity,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  providerOptions,
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

  /**
    Additional provider-specific options. They are passed through
    to the provider from the AI SDK and enable provider-specific
    functionality that can be fully encapsulated in the provider.
    */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of concurrent requests.
   *
   * @default Infinity
   */
  maxParallelCalls?: number;
}): Promise<RerankResult<VALUE>> {
  if (model.specificationVersion !== 'v2') {
    throw new UnsupportedModelVersionError({
      version: model.specificationVersion,
      provider: model.provider,
      modelId: model.modelId,
    });
  }
  const { maxRetries, retry } = prepareRetries({ maxRetries: maxRetriesArg });

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
        'ai.values': { input: () => values.map(v => JSON.stringify(v)) },
      },
    }),
    tracer,
    fn: async span => {
      const [maxDocumentsPerCall, supportsParallelCalls] = await Promise.all([
        model.maxDocumentsPerCall,
        model.supportsParallelCalls,
      ]);

      if (maxDocumentsPerCall == null || maxDocumentsPerCall === Infinity) {
        const { rerankedIndices, usage, rerankedDocuments, response } =
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
                  'ai.values': {
                    input: () => values.map(value => JSON.stringify(value)),
                  },
                },
              }),
              tracer,
              fn: async doRerankSpan => {
                const modelResponse = await model.doRerank({
                  values,
                  query,
                  topK,
                  returnDocuments,
                  providerOptions,
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
                        output: () =>
                          rerankedIndices.map(index => JSON.stringify(index)),
                      },
                      'ai.usage.tokens': usage.tokens,
                      'ai.rerankedDocuments': {
                        output: () =>
                          rerankedDocuments.map(doc => JSON.stringify(doc)),
                      },
                    },
                  }),
                );

                return {
                  rerankedIndices,
                  usage,
                  rerankedDocuments,
                  response: modelResponse.response,
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
          responses: [response],
        });
      }

      // split the values into chunks that are small enough for the model:
      const valueChunks = splitArray(values, maxDocumentsPerCall);

      const rerankedIndices: Array<RerankingModelV2Result> = [];
      const rerankedDocuments: Array<VALUE> = [];
      const responses: Array<
        | {
            headers?: Record<string, string>;
            body?: unknown;
          }
        | undefined
      > = [];
      let tokens = 0;

      const parallelChunks = splitArray(
        valueChunks,
        supportsParallelCalls ? maxParallelCalls : 1,
      );

      for (const parallelChunk of parallelChunks) {
        const results = await Promise.all(
          parallelChunk.map(chunk => {
            return retry(() => {
              return recordSpan({
                name: 'ai.rerank.doRerank',
                attributes: selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    ...assembleOperationName({
                      operationId: 'ai.rerank.doRerank',
                      telemetry,
                    }),
                    ...baseTelemetryAttributes,
                    'ai.values': {
                      input: () => chunk.map(value => JSON.stringify(value)),
                    },
                  },
                }),
                tracer,
                fn: async doRerankSpan => {
                  const modelResponse = await model.doRerank({
                    values: chunk,
                    query,
                    topK,
                    providerOptions,
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
                          output: () =>
                            JSON.stringify(chunkedRerankedDocuments),
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
              });
            });
          }),
        );

        for (const result of results) {
          rerankedIndices.push(...result.rerankedIndices);
          rerankedDocuments.push(...result.rerankedDocuments);
          tokens += result.usage.tokens;
        }
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
        responses,
      });
    },
  });
}

class DefaultRerankResult<VALUE> implements RerankResult<VALUE> {
  readonly documents: RerankResult<VALUE>['documents'];
  readonly rerankedIndices: RerankResult<VALUE>['rerankedIndices'];
  readonly rerankedDocuments: RerankResult<VALUE>['documents'];
  readonly usage: RerankResult<VALUE>['usage'];
  readonly responses: RerankResult<VALUE>['responses'];

  constructor(options: {
    values: RerankResult<VALUE>['documents'];
    rerankedIndices: RerankResult<VALUE>['rerankedIndices'];
    rerankedDocuments: RerankResult<VALUE>['documents'];
    usage: RerankResult<VALUE>['usage'];
    responses?: RerankResult<VALUE>['responses'];
  }) {
    this.documents = options.values;
    this.rerankedIndices = options.rerankedIndices;
    this.rerankedDocuments = options.rerankedDocuments;
    this.usage = options.usage;
    this.responses = options.responses;
  }
}
