import { TooManyDocumentsForRerankingError } from '@ai-sdk/provider';
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
import { UnsupportedModelVersionError } from '../error';

/**
Rerank documents using an reranking model. The type of the value is defined by the reranking model.

@param model - The Reranking model to use.
@param values - The documents that should be reranking.
@param query - The query is a string that represents the query to rerank the documents against.
@param topK - Top k documents to rerank.

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
  if (model.specificationVersion !== 'v3') {
    throw new UnsupportedModelVersionError({
      version: model.specificationVersion,
      provider: model.provider,
      modelId: model.modelId,
    });
  }

  const maxDocumentsPerCall = await model.maxDocumentsPerCall;
  if (maxDocumentsPerCall != null && values.length > maxDocumentsPerCall) {
    throw new TooManyDocumentsForRerankingError({
      provider: model.provider,
      modelId: model.modelId,
      maxDocumentsPerCall,
      documents: values,
    });
  }
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
        'ai.values': { input: () => values.map(v => JSON.stringify(v)) },
      },
    }),
    tracer,
    fn: async span => {
      const { rerankedDocuments, usage, response, providerMetadata } =
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
                providerOptions,
                abortSignal,
                headers,
              });

              const rerankedDocuments = modelResponse.rerankedDocuments;
              const usage = modelResponse.usage ?? { tokens: NaN };

              doRerankSpan.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'ai.rerankedDocuments': {
                      output: () =>
                        rerankedDocuments.map(rerankedDocument =>
                          JSON.stringify(rerankedDocument),
                        ),
                    },
                    'ai.usage.tokens': usage.tokens,
                  },
                }),
              );

              return {
                rerankedDocuments,
                usage,
                providerMetadata: modelResponse.providerMetadata,
                response: modelResponse.response,
              };
            },
          }),
        );

      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.rerankedDocuments': {
              output: () =>
                rerankedDocuments.map(rerankedDocument =>
                  JSON.stringify(rerankedDocument),
                ),
            },
            'ai.usage.tokens': usage.tokens,
          },
        }),
      );

      return new DefaultRerankResult({
        values,
        rerankedDocuments,
        usage,
        providerMetadata,
        response,
      });
    },
  });
}

class DefaultRerankResult<VALUE> implements RerankResult<VALUE> {
  readonly documents: RerankResult<VALUE>['documents'];
  readonly usage: RerankResult<VALUE>['usage'];
  readonly response: RerankResult<VALUE>['response'];
  readonly rerankedDocuments: RerankResult<VALUE>['rerankedDocuments'];
  readonly providerMetadata: RerankResult<VALUE>['providerMetadata'];

  constructor(options: {
    values: RerankResult<VALUE>['documents'];
    usage: RerankResult<VALUE>['usage'];
    response?: RerankResult<VALUE>['response'];
    rerankedDocuments: RerankResult<VALUE>['rerankedDocuments'];
    providerMetadata?: RerankResult<VALUE>['providerMetadata'];
  }) {
    this.documents = options.values;
    this.usage = options.usage;
    this.response = options.response;
    this.rerankedDocuments = options.rerankedDocuments;
    this.providerMetadata = options.providerMetadata;
  }
}
