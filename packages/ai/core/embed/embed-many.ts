import { prepareRetries } from '../prompt/prepare-retries';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { Embedding, EmbeddingModel } from '../types';
import { splitArray } from '../util/split-array';
import { EmbedManyResult } from './embed-many-result';

/**
Embed several values using an embedding model. The type of the value is defined
by the embedding model.

`embedMany` automatically splits large requests into smaller chunks if the model
has a limit on how many embeddings can be generated in a single call.

@param model - The embedding model to use.
@param values - The values that should be embedded.

@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the embeddings, the value, and additional information.
 */
export async function embedMany<VALUE>({
  model,
  values,
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
The values that should be embedded.
   */
  values: Array<VALUE>;

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
}): Promise<EmbedManyResult<VALUE>> {
  const { maxRetries, retry } = prepareRetries({ maxRetries: maxRetriesArg });

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { maxRetries },
  });

  const tracer = getTracer(telemetry);

  return recordSpan({
    name: 'ai.embedMany',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({ operationId: 'ai.embedMany', telemetry }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        'ai.values': {
          input: () => values.map(value => JSON.stringify(value)),
        },
      },
    }),
    tracer,
    fn: async span => {
      const maxEmbeddingsPerCall = model.maxEmbeddingsPerCall;

      // the model has not specified limits on
      // how many embeddings can be generated in a single call
      if (maxEmbeddingsPerCall == null) {
        const { embeddings, usage } = await retry(() => {
          // nested spans to align with the embedMany telemetry data:
          return recordSpan({
            name: 'ai.embedMany.doEmbed',
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationId: 'ai.embedMany.doEmbed',
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
            fn: async doEmbedSpan => {
              const modelResponse = await model.doEmbed({
                values,
                abortSignal,
                headers,
              });

              const embeddings = modelResponse.embeddings;
              const usage = modelResponse.usage ?? { tokens: NaN };

              doEmbedSpan.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'ai.embeddings': {
                      output: () =>
                        embeddings.map(embedding => JSON.stringify(embedding)),
                    },
                    'ai.usage.tokens': usage.tokens,
                  },
                }),
              );

              return { embeddings, usage };
            },
          });
        });

        span.setAttributes(
          selectTelemetryAttributes({
            telemetry,
            attributes: {
              'ai.embeddings': {
                output: () =>
                  embeddings.map(embedding => JSON.stringify(embedding)),
              },
              'ai.usage.tokens': usage.tokens,
            },
          }),
        );

        return new DefaultEmbedManyResult({ values, embeddings, usage });
      }

      // split the values into chunks that are small enough for the model:
      const valueChunks = splitArray(values, maxEmbeddingsPerCall);

      // serially embed the chunks:
      const embeddings: Array<Embedding> = [];
      let tokens = 0;

      for (const chunk of valueChunks) {
        const { embeddings: responseEmbeddings, usage } = await retry(() => {
          // nested spans to align with the embedMany telemetry data:
          return recordSpan({
            name: 'ai.embedMany.doEmbed',
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationId: 'ai.embedMany.doEmbed',
                  telemetry,
                }),
                ...baseTelemetryAttributes,
                // specific settings that only make sense on the outer level:
                'ai.values': {
                  input: () => chunk.map(value => JSON.stringify(value)),
                },
              },
            }),
            tracer,
            fn: async doEmbedSpan => {
              const modelResponse = await model.doEmbed({
                values: chunk,
                abortSignal,
                headers,
              });

              const embeddings = modelResponse.embeddings;
              const usage = modelResponse.usage ?? { tokens: NaN };

              doEmbedSpan.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'ai.embeddings': {
                      output: () =>
                        embeddings.map(embedding => JSON.stringify(embedding)),
                    },
                    'ai.usage.tokens': usage.tokens,
                  },
                }),
              );

              return { embeddings, usage };
            },
          });
        });

        embeddings.push(...responseEmbeddings);
        tokens += usage.tokens;
      }

      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.embeddings': {
              output: () =>
                embeddings.map(embedding => JSON.stringify(embedding)),
            },
            'ai.usage.tokens': tokens,
          },
        }),
      );

      return new DefaultEmbedManyResult({
        values,
        embeddings,
        usage: { tokens },
      });
    },
  });
}

class DefaultEmbedManyResult<VALUE> implements EmbedManyResult<VALUE> {
  readonly values: EmbedManyResult<VALUE>['values'];
  readonly embeddings: EmbedManyResult<VALUE>['embeddings'];
  readonly usage: EmbedManyResult<VALUE>['usage'];

  constructor(options: {
    values: EmbedManyResult<VALUE>['values'];
    embeddings: EmbedManyResult<VALUE>['embeddings'];
    usage: EmbedManyResult<VALUE>['usage'];
  }) {
    this.values = options.values;
    this.embeddings = options.embeddings;
    this.usage = options.usage;
  }
}
