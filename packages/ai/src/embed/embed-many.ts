import {
  createIdGenerator,
  ProviderOptions,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { logWarnings } from '../logger/log-warnings';
import { resolveEmbeddingModel } from '../model/resolve-model';
import { getGlobalTelemetryIntegration } from '../telemetry/get-global-telemetry-integration';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { Embedding, EmbeddingModel, ProviderMetadata } from '../types';
import { Warning } from '../types/warning';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import { splitArray } from '../util/split-array';
import type { EmbedOnFinishEvent, EmbedOnStartEvent } from './embed-events';
import { EmbedManyResult } from './embed-many-result';
import { VERSION } from '../version';
import type { Listener } from '../util/notify';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/**
 * Embed several values using an embedding model. The type of the value is defined
 * by the embedding model.
 *
 * `embedMany` automatically splits large requests into smaller chunks if the model
 * has a limit on how many embeddings can be generated in a single call.
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
  experimental_onStart: onStart,
  experimental_onFinish: onFinish,
  _internal: { generateCallId = originalGenerateCallId } = {},
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

  /**
   * Callback that is called when the embedMany operation begins,
   * before the embedding model is called.
   */
  experimental_onStart?: Listener<EmbedOnStartEvent>;

  /**
   * Callback that is called when the embedMany operation completes,
   * after all embedding model calls return.
   */
  experimental_onFinish?: Listener<EmbedOnFinishEvent>;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    generateCallId?: () => string;
  };
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

  const callId = generateCallId();

  const createGlobalTelemetry = getGlobalTelemetryIntegration();
  const globalTelemetry = createGlobalTelemetry({
    integrations: telemetry?.integrations,
  });

  await notify({
    event: {
      callId,
      operationId: 'ai.embedMany',
      provider: model.provider,
      modelId: model.modelId,
      value: values,
      maxRetries,
      abortSignal,
      headers: headersWithUserAgent,
      providerOptions,
      isEnabled: telemetry?.isEnabled,
      recordInputs: telemetry?.recordInputs,
      recordOutputs: telemetry?.recordOutputs,
      functionId: telemetry?.functionId,
      metadata: telemetry?.metadata,
    },
    callbacks: [onStart, globalTelemetry.onStart],
  });

  try {
    const [maxEmbeddingsPerCall, supportsParallelCalls] = await Promise.all([
      model.maxEmbeddingsPerCall,
      model.supportsParallelCalls,
    ]);

    if (maxEmbeddingsPerCall == null || maxEmbeddingsPerCall === Infinity) {
      const { embeddings, usage, warnings, response, providerMetadata } =
        await retry(async () => {
          const embedCallId = generateCallId();

          await notify({
            event: {
              callId,
              embedCallId,
              operationId: 'ai.embedMany.doEmbed',
              provider: model.provider,
              modelId: model.modelId,
              values,
              isEnabled: telemetry?.isEnabled,
              recordInputs: telemetry?.recordInputs,
              recordOutputs: telemetry?.recordOutputs,
              functionId: telemetry?.functionId,
              metadata: telemetry?.metadata,
            },
            callbacks: [globalTelemetry.onEmbedStart],
          });

          const modelResponse = await model.doEmbed({
            values,
            abortSignal,
            headers: headersWithUserAgent,
            providerOptions,
          });

          const embeddings = modelResponse.embeddings;
          const usage = modelResponse.usage ?? { tokens: NaN };

          await notify({
            event: {
              callId,
              embedCallId,
              operationId: 'ai.embedMany.doEmbed',
              provider: model.provider,
              modelId: model.modelId,
              values,
              embeddings,
              usage,
            },
            callbacks: [globalTelemetry.onEmbedFinish],
          });

          return {
            embeddings,
            usage,
            warnings: modelResponse.warnings ?? [],
            providerMetadata: modelResponse.providerMetadata,
            response: modelResponse.response,
          };
        });

      logWarnings({
        warnings,
        provider: model.provider,
        model: model.modelId,
      });

      await notify({
        event: {
          callId,
          operationId: 'ai.embedMany',
          provider: model.provider,
          modelId: model.modelId,
          value: values,
          embedding: embeddings,
          usage,
          warnings,
          providerMetadata,
          response: [response],
          isEnabled: telemetry?.isEnabled,
          recordInputs: telemetry?.recordInputs,
          recordOutputs: telemetry?.recordOutputs,
          functionId: telemetry?.functionId,
          metadata: telemetry?.metadata,
        },
        callbacks: [onFinish, globalTelemetry.onFinish],
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

    const valueChunks = splitArray(values, maxEmbeddingsPerCall);

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
          return retry(async () => {
            const embedCallId = generateCallId();

            await notify({
              event: {
                callId,
                embedCallId,
                operationId: 'ai.embedMany.doEmbed',
                provider: model.provider,
                modelId: model.modelId,
                values: chunk,
                isEnabled: telemetry?.isEnabled,
                recordInputs: telemetry?.recordInputs,
                recordOutputs: telemetry?.recordOutputs,
                functionId: telemetry?.functionId,
                metadata: telemetry?.metadata,
              },
              callbacks: [globalTelemetry.onEmbedStart],
            });

            const modelResponse = await model.doEmbed({
              values: chunk,
              abortSignal,
              headers: headersWithUserAgent,
              providerOptions,
            });

            const chunkEmbeddings = modelResponse.embeddings;
            const usage = modelResponse.usage ?? { tokens: NaN };

            await notify({
              event: {
                callId,
                embedCallId,
                operationId: 'ai.embedMany.doEmbed',
                provider: model.provider,
                modelId: model.modelId,
                values: chunk,
                embeddings: chunkEmbeddings,
                usage,
              },
              callbacks: [globalTelemetry.onEmbedFinish],
            });

            return {
              embeddings: chunkEmbeddings,
              usage,
              warnings: modelResponse.warnings ?? [],
              providerMetadata: modelResponse.providerMetadata,
              response: modelResponse.response,
            };
          });
        }),
      );

      for (const result of results) {
        embeddings.push(...result.embeddings);
        if (result.warnings) {
          warnings.push(...result.warnings);
        }
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

    logWarnings({
      warnings,
      provider: model.provider,
      model: model.modelId,
    });

    await notify({
      event: {
        callId,
        operationId: 'ai.embedMany',
        provider: model.provider,
        modelId: model.modelId,
        value: values,
        embedding: embeddings,
        usage: { tokens },
        warnings,
        providerMetadata,
        response: responses,
        isEnabled: telemetry?.isEnabled,
        recordInputs: telemetry?.recordInputs,
        recordOutputs: telemetry?.recordOutputs,
        functionId: telemetry?.functionId,
        metadata: telemetry?.metadata,
      },
      callbacks: [onFinish, globalTelemetry.onFinish],
    });

    return new DefaultEmbedManyResult({
      values,
      embeddings,
      usage: { tokens },
      warnings,
      providerMetadata: providerMetadata,
      responses,
    });
  } catch (error) {
    await globalTelemetry.onError?.({ callId, error });
    throw error;
  }
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
