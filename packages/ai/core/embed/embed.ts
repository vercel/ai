import { prepareRetries } from '../prompt/prepare-retries';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { EmbeddingModel } from '../types';
import { EmbedResult } from './embed-result';

/**
Embed a value using an embedding model. The type of the value is defined by the embedding model.

@param model - The embedding model to use.
@param value - The value that should be embedded.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the embedding, the value, and additional information.
 */
export async function embed<VALUE>({
  model,
  value,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  experimental_telemetry: telemetry,
}: {
  /**
The embedding model to use.
     */
  model: EmbeddingModel<VALUE>;

  /**
The value that should be embedded.
   */
  value: VALUE;

  /**
Maximum number of retries per embedding model call. Set to 0 to disable retries.

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
}): Promise<EmbedResult<VALUE>> {
  const { maxRetries, retry } = prepareRetries({ maxRetries: maxRetriesArg });

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { maxRetries },
  });

  const tracer = getTracer(telemetry);

  return recordSpan({
    name: 'ai.embed',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({ operationId: 'ai.embed', telemetry }),
        ...baseTelemetryAttributes,
        'ai.value': { input: () => JSON.stringify(value) },
      },
    }),
    tracer,
    fn: async span => {
      const { embedding, usage, rawResponse } = await retry(() =>
        // nested spans to align with the embedMany telemetry data:
        recordSpan({
          name: 'ai.embed.doEmbed',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              ...assembleOperationName({
                operationId: 'ai.embed.doEmbed',
                telemetry,
              }),
              ...baseTelemetryAttributes,
              // specific settings that only make sense on the outer level:
              'ai.values': { input: () => [JSON.stringify(value)] },
            },
          }),
          tracer,
          fn: async doEmbedSpan => {
            const modelResponse = await model.doEmbed({
              values: [value],
              abortSignal,
              headers,
            });

            const embedding = modelResponse.embeddings[0];
            const usage = modelResponse.usage ?? { tokens: NaN };

            doEmbedSpan.setAttributes(
              selectTelemetryAttributes({
                telemetry,
                attributes: {
                  'ai.embeddings': {
                    output: () =>
                      modelResponse.embeddings.map(embedding =>
                        JSON.stringify(embedding),
                      ),
                  },
                  'ai.usage.tokens': usage.tokens,
                },
              }),
            );

            return {
              embedding,
              usage,
              rawResponse: modelResponse.rawResponse,
            };
          },
        }),
      );

      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.embedding': { output: () => JSON.stringify(embedding) },
            'ai.usage.tokens': usage.tokens,
          },
        }),
      );

      return new DefaultEmbedResult({ value, embedding, usage, rawResponse });
    },
  });
}

class DefaultEmbedResult<VALUE> implements EmbedResult<VALUE> {
  readonly value: EmbedResult<VALUE>['value'];
  readonly embedding: EmbedResult<VALUE>['embedding'];
  readonly usage: EmbedResult<VALUE>['usage'];
  readonly rawResponse: EmbedResult<VALUE>['rawResponse'];

  constructor(options: {
    value: EmbedResult<VALUE>['value'];
    embedding: EmbedResult<VALUE>['embedding'];
    usage: EmbedResult<VALUE>['usage'];
    rawResponse?: EmbedResult<VALUE>['rawResponse'];
  }) {
    this.value = options.value;
    this.embedding = options.embedding;
    this.usage = options.usage;
    this.rawResponse = options.rawResponse;
  }
}
