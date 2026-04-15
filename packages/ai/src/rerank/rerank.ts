import { JSONObject, RerankingModelV4CallOptions } from '@ai-sdk/provider';
import { createIdGenerator, ProviderOptions } from '@ai-sdk/provider-utils';
import { prepareRetries } from '../../src/util/prepare-retries';
import { logWarnings } from '../logger/log-warnings';
import { resolveRerankingModel } from '../model/resolve-model';
import { createUnifiedTelemetry } from '../telemetry/create-unified-telemetry';
import { TelemetryOptions } from '../telemetry/telemetry-options';
import { RerankingModel } from '../types';
import type { Callback } from '../util/callback';
import { notify } from '../util/notify';
import type { RerankOnFinishEvent, RerankOnStartEvent } from './rerank-events';
import { RerankResult } from './rerank-result';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/**
 * Rerank documents using a reranking model. The type of the value is defined by the reranking model.
 *
 * @param model - The reranking model to use.
 * @param documents - The documents that should be reranked.
 * @param query - The query to rerank the documents against.
 * @param topN - Number of top documents to return.
 *
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param providerOptions - Additional provider-specific options.
 * @param experimental_telemetry - Optional telemetry configuration (experimental).
 *
 * @returns A result object that contains the reranked documents, the reranked indices, and additional information.
 */
export async function rerank<VALUE extends JSONObject | string>({
  model: modelArg,
  documents,
  query,
  topN,
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
   * The reranking model to use.
   */
  model: RerankingModel;

  /**
   * The documents that should be reranked.
   */
  documents: Array<VALUE>;

  /**
   * The query to rerank the documents against.
   */
  query: string;

  /**
   * Number of top documents to return.
   */
  topN?: number;

  /**
   * Maximum number of retries per reranking model call. Set to 0 to disable retries.
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
  experimental_telemetry?: TelemetryOptions;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;

  /**
   * Callback that is called when the rerank operation begins,
   * before the reranking model is called.
   */
  experimental_onStart?: Callback<RerankOnStartEvent>;

  /**
   * Callback that is called when the rerank operation completes,
   * after the reranking model returns.
   */
  experimental_onFinish?: Callback<RerankOnFinishEvent>;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<RerankResult<VALUE>> {
  const model = resolveRerankingModel(modelArg);
  const callId = generateCallId();

  const unifiedTelemetry = createUnifiedTelemetry({
    integrations: telemetry?.integrations,
  });

  if (documents.length === 0) {
    await notify({
      event: {
        callId,
        operationId: 'ai.rerank',
        provider: model.provider,
        modelId: model.modelId,
        documents,
        query,
        topN,
        maxRetries: maxRetriesArg ?? 2,
        headers,
        providerOptions,
        isEnabled: telemetry?.isEnabled,
        recordInputs: telemetry?.recordInputs,
        recordOutputs: telemetry?.recordOutputs,
        functionId: telemetry?.functionId,
      },
      callbacks: [onStart, unifiedTelemetry.onStart],
    });

    await notify({
      event: {
        callId,
        operationId: 'ai.rerank',
        provider: model.provider,
        modelId: model.modelId,
        documents,
        query,
        ranking: [],
        warnings: [],
        providerMetadata: undefined,
        response: {
          timestamp: new Date(),
          modelId: model.modelId,
        },
        isEnabled: telemetry?.isEnabled,
        recordInputs: telemetry?.recordInputs,
        recordOutputs: telemetry?.recordOutputs,
        functionId: telemetry?.functionId,
      },
      callbacks: [onFinish, unifiedTelemetry.onFinish],
    });

    return new DefaultRerankResult({
      originalDocuments: [],
      ranking: [],
      providerMetadata: undefined,
      response: {
        timestamp: new Date(),
        modelId: model.modelId,
      },
    });
  }

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const documentsToSend: RerankingModelV4CallOptions['documents'] =
    typeof documents[0] === 'string'
      ? { type: 'text', values: documents as string[] }
      : { type: 'object', values: documents as JSONObject[] };

  await notify({
    event: {
      callId,
      operationId: 'ai.rerank',
      provider: model.provider,
      modelId: model.modelId,
      documents,
      query,
      topN,
      maxRetries,
      headers,
      providerOptions,
      isEnabled: telemetry?.isEnabled,
      recordInputs: telemetry?.recordInputs,
      recordOutputs: telemetry?.recordOutputs,
      functionId: telemetry?.functionId,
    },
    callbacks: [onStart, unifiedTelemetry.onStart],
  });

  try {
    const { ranking, response, providerMetadata, warnings } = await retry(
      async () => {
        await notify({
          event: {
            callId,
            operationId: 'ai.rerank.doRerank',
            provider: model.provider,
            modelId: model.modelId,
            documents,
            documentsType: documentsToSend.type,
            query,
            topN,
            isEnabled: telemetry?.isEnabled,
            recordInputs: telemetry?.recordInputs,
            recordOutputs: telemetry?.recordOutputs,
            functionId: telemetry?.functionId,
          },
          callbacks: [unifiedTelemetry.onRerankStart],
        });

        const modelResponse = await model.doRerank({
          documents: documentsToSend,
          query,
          topN,
          providerOptions,
          abortSignal,
          headers,
        });

        const ranking = modelResponse.ranking;

        await notify({
          event: {
            callId,
            operationId: 'ai.rerank.doRerank',
            provider: model.provider,
            modelId: model.modelId,
            documentsType: documentsToSend.type,
            ranking,
          },
          callbacks: [unifiedTelemetry.onRerankFinish],
        });

        return {
          ranking,
          providerMetadata: modelResponse.providerMetadata,
          response: modelResponse.response,
          warnings: modelResponse.warnings,
        };
      },
    );

    logWarnings({
      warnings: warnings ?? [],
      provider: model.provider,
      model: model.modelId,
    });

    await notify({
      event: {
        callId,
        operationId: 'ai.rerank',
        provider: model.provider,
        modelId: model.modelId,
        documents,
        query,
        ranking: ranking.map(r => ({
          originalIndex: r.index,
          score: r.relevanceScore,
          document: documents[r.index],
        })),
        warnings: warnings ?? [],
        providerMetadata,
        response: {
          id: response?.id,
          timestamp: response?.timestamp ?? new Date(),
          modelId: response?.modelId ?? model.modelId,
          headers: response?.headers,
          body: response?.body,
        },
        isEnabled: telemetry?.isEnabled,
        recordInputs: telemetry?.recordInputs,
        recordOutputs: telemetry?.recordOutputs,
        functionId: telemetry?.functionId,
      },
      callbacks: [onFinish, unifiedTelemetry.onFinish],
    });

    return new DefaultRerankResult({
      originalDocuments: documents,
      ranking: ranking.map(ranking => ({
        originalIndex: ranking.index,
        score: ranking.relevanceScore,
        document: documents[ranking.index],
      })),
      providerMetadata,
      response: {
        id: response?.id,
        timestamp: response?.timestamp ?? new Date(),
        modelId: response?.modelId ?? model.modelId,
        headers: response?.headers,
        body: response?.body,
      },
    });
  } catch (error) {
    await unifiedTelemetry.onError?.({ callId, error });
    throw error;
  }
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
    response: RerankResult<VALUE>['response'];
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
