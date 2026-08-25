import {
  withUserAgentSuffix,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { logWarnings } from '../logger/log-warnings';
import { getEmbeddingModelMaxInputBytesPerCall } from '../model/get-embedding-model-max-input-bytes-per-call';
import { resolveEmbeddingModel } from '../model/resolve-model';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import type { TelemetrySettings } from '../telemetry/telemetry-settings';
import type { Embedding, EmbeddingModel, ProviderMetadata } from '../types';
import type { Warning } from '../types/warning';
import { prepareRetries } from '../util/prepare-retries';
import { splitArray } from '../util/split-array';
import type { EmbedManyResult } from './embed-many-result';
import { VERSION } from '../version';

/**
 * Embed several values using an embedding model. The type of the value is defined
 * by the embedding model.
 *
 * `embedMany` automatically splits large requests into smaller chunks when the
 * model has a limit on either the number of embeddings or the UTF-8 input bytes
 * that can be processed in a single call.
 *
 * @param model - The embedding model to use.
 * @param values - The values that should be embedded.
 *
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 *
 * @param maxParallelCalls - Maximum number of concurrent requests. Default: Infinity.
 *
 * @param experimental_telemetry - Optional telemetry configuration (experimental).
 *
 * @param providerOptions - Additional provider-specific options. They are passed through
 * to the provider from the AI SDK and enable provider-specific
 * functionality that can be fully encapsulated in the provider.
 *
 * @returns A result object that contains the embeddings, the value, and additional information.
 */
export async function embedMany({
  model: modelArg,
  values,
  maxParallelCalls = Infinity,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  providerOptions,
  experimental_telemetry: telemetry,
}: {
  /**
   * The embedding model to use.
   */
  model: EmbeddingModel;

  /**
   * The values that should be embedded.
   */
  values: Array<string>;

  /**
   * Maximum number of retries per embedding model call. Set to 0 to disable retries.
   *
   * @default 2
   */
  maxRetries?: number;

  /**
   * Abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional headers to include in the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string>;

  /**
   * Optional telemetry configuration (experimental).
   */
  experimental_telemetry?: TelemetrySettings;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of concurrent requests.
   *
   * @default Infinity
   */
  maxParallelCalls?: number;
}): Promise<EmbedManyResult> {
  const model = resolveEmbeddingModel(modelArg);

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headersWithUserAgent,
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
      const [
        maxEmbeddingsPerCall,
        maxInputBytesPerCall,
        supportsParallelCalls,
      ] = await Promise.all([
        model.maxEmbeddingsPerCall,
        getEmbeddingModelMaxInputBytesPerCall(model),
        model.supportsParallelCalls,
      ]);

      const hasEmbeddingLimit =
        maxEmbeddingsPerCall != null && maxEmbeddingsPerCall !== Infinity;
      const hasInputByteLimit =
        maxInputBytesPerCall != null && maxInputBytesPerCall !== Infinity;

      // the model has not specified limits on
      // how many embeddings or input bytes can be processed in a single call
      if (!hasEmbeddingLimit && !hasInputByteLimit) {
        const { embeddings, usage, warnings, response, providerMetadata } =
          await retry(() => {
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
                  headers: headersWithUserAgent,
                  providerOptions,
                });

                const embeddings = modelResponse.embeddings;
                const usage = modelResponse.usage ?? { tokens: NaN };

                doEmbedSpan.setAttributes(
                  await selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      'ai.embeddings': {
                        output: () =>
                          embeddings.map(embedding =>
                            JSON.stringify(embedding),
                          ),
                      },
                      'ai.usage.tokens': usage.tokens,
                    },
                  }),
                );

                return {
                  embeddings,
                  usage,
                  warnings: modelResponse.warnings ?? [],
                  providerMetadata: modelResponse.providerMetadata,
                  response: modelResponse.response,
                };
              },
            });
          });

        span.setAttributes(
          await selectTelemetryAttributes({
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

        logWarnings({
          warnings,
          provider: model.provider,
          model: model.modelId,
        });

        return new DefaultEmbedManyResult({
          values,
          embeddings,
          usage,
          warnings,
          providerMetadata,
          responses: [response],
        });
      }

      // split the values into chunks that are small enough for the model:
      const valueChunks = splitByEmbeddingLimits({
        values,
        maxEmbeddingsPerCall: hasEmbeddingLimit
          ? maxEmbeddingsPerCall
          : Infinity,
        maxInputBytesPerCall: hasInputByteLimit
          ? maxInputBytesPerCall
          : Infinity,
      });

      // serially embed the chunks:
      const embeddings: Array<Embedding> = [];
      const warnings: Array<Warning> = [];
      const responses: Array<
        | {
            headers?: Record<string, string>;
            body?: unknown;
          }
        | undefined
      > = [];
      let tokens = 0;
      let providerMetadata: ProviderMetadata | undefined;

      const parallelChunks = splitArray(
        valueChunks,
        supportsParallelCalls ? maxParallelCalls : 1,
      );

      for (const parallelChunk of parallelChunks) {
        const results = await Promise.all(
          parallelChunk.map(chunk => {
            return retry(() => {
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
                    headers: headersWithUserAgent,
                    providerOptions,
                  });

                  const embeddings = modelResponse.embeddings;
                  const usage = modelResponse.usage ?? { tokens: NaN };

                  doEmbedSpan.setAttributes(
                    await selectTelemetryAttributes({
                      telemetry,
                      attributes: {
                        'ai.embeddings': {
                          output: () =>
                            embeddings.map(embedding =>
                              JSON.stringify(embedding),
                            ),
                        },
                        'ai.usage.tokens': usage.tokens,
                      },
                    }),
                  );

                  return {
                    embeddings,
                    usage,
                    warnings: modelResponse.warnings ?? [],
                    providerMetadata: modelResponse.providerMetadata,
                    response: modelResponse.response,
                  };
                },
              });
            });
          }),
        );

        for (const result of results) {
          embeddings.push(...result.embeddings);
          warnings.push(...result.warnings);
          responses.push(result.response);
          tokens += result.usage.tokens;
          if (result.providerMetadata) {
            if (!providerMetadata) {
              providerMetadata = { ...result.providerMetadata };
            } else {
              for (const [providerName, metadata] of Object.entries(
                result.providerMetadata,
              )) {
                providerMetadata[providerName] = {
                  ...(providerMetadata[providerName] ?? {}),
                  ...metadata,
                };
              }
            }
          }
        }
      }

      span.setAttributes(
        await selectTelemetryAttributes({
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

      logWarnings({
        warnings,
        provider: model.provider,
        model: model.modelId,
      });

      return new DefaultEmbedManyResult({
        values,
        embeddings,
        usage: { tokens },
        warnings,
        providerMetadata: providerMetadata,
        responses,
      });
    },
  });
}

const textEncoder = new TextEncoder();

function splitByEmbeddingLimits({
  values,
  maxEmbeddingsPerCall,
  maxInputBytesPerCall,
}: {
  values: Array<string>;
  maxEmbeddingsPerCall: number;
  maxInputBytesPerCall: number;
}): Array<Array<string>> {
  if (maxEmbeddingsPerCall <= 0) {
    throw new Error('maxEmbeddingsPerCall must be greater than 0');
  }

  if (maxInputBytesPerCall <= 0) {
    throw new Error('maxInputBytesPerCall must be greater than 0');
  }

  if (values.length === 0) {
    return [];
  }

  const chunks: Array<Array<string>> = [];
  let currentChunk: Array<string> = [];
  let currentInputBytes = 0;

  for (const value of values) {
    const inputBytes = textEncoder.encode(value).length;

    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= maxEmbeddingsPerCall ||
        currentInputBytes + inputBytes > maxInputBytesPerCall)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentInputBytes = 0;
    }

    currentChunk.push(value);
    currentInputBytes += inputBytes;
  }

  chunks.push(currentChunk);

  return chunks;
}

class DefaultEmbedManyResult implements EmbedManyResult {
  readonly values: EmbedManyResult['values'];
  readonly embeddings: EmbedManyResult['embeddings'];
  readonly usage: EmbedManyResult['usage'];
  readonly warnings: EmbedManyResult['warnings'];
  readonly providerMetadata: EmbedManyResult['providerMetadata'];
  readonly responses: EmbedManyResult['responses'];

  constructor(options: {
    values: EmbedManyResult['values'];
    embeddings: EmbedManyResult['embeddings'];
    usage: EmbedManyResult['usage'];
    warnings: EmbedManyResult['warnings'];
    providerMetadata?: EmbedManyResult['providerMetadata'];
    responses?: EmbedManyResult['responses'];
  }) {
    this.values = options.values;
    this.embeddings = options.embeddings;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.providerMetadata = options.providerMetadata;
    this.responses = options.responses;
  }
}
