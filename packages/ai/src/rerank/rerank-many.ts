import type { JSONObject, RerankingModelV4CallOptions } from '@ai-sdk/provider';
import {
  createIdGenerator,
  type ProviderOptions,
} from '@ai-sdk/provider-utils';
import { logWarnings } from '../logger/log-warnings';
import { resolveRerankingModel } from '../model/resolve-model';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type { ProviderMetadata, RerankingModel } from '../types';
import type { Warning } from '../types/warning';
import type { Callback } from '../util/callback';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import { splitArray } from '../util/split-array';
import type { RerankEndEvent, RerankStartEvent } from './rerank-events';
import type { RerankManyResult } from './rerank-many-result';

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/**
 * Rerank several documents using a reranking model. The type of the value is
 * defined by the reranking model.
 *
 * `rerankMany` automatically splits large requests into smaller windows if the
 * model has a limit on how many documents can be reranked in a single call
 * (`maxDocumentsPerCall`). Each window is scored independently and the results
 * are merged and re-sorted by relevance score before the optional `topN` limit
 * is applied.
 *
 * This assumes the model scores each document against the query independently
 * (pointwise/pairwise), so a document's score does not depend on which other
 * documents share the call. Models that score documents relative to each other
 * (listwise) may rank differently when the documents are split across windows.
 *
 * @param model - The reranking model to use.
 * @param documents - The documents that should be reranked.
 * @param query - The query to rerank the documents against.
 * @param topN - Number of top documents to return.
 *
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param maxParallelCalls - Maximum number of concurrent requests. Default: Infinity.
 * @param providerOptions - Additional provider-specific options.
 * @param telemetry - Optional telemetry configuration.
 *
 * @returns A result object that contains the reranked documents, the reranked indices, and additional information.
 */
export async function rerankMany<VALUE extends JSONObject | string>({
  model: modelArg,
  documents,
  query,
  topN,
  maxParallelCalls = Infinity,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  providerOptions,
  experimental_telemetry,
  telemetry = experimental_telemetry,
  onStart,
  experimental_onStart,
  onEnd,
  experimental_onEnd,
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
   * Optional telemetry configuration.
   */
  telemetry?: TelemetryOptions;

  /**
   * Optional telemetry configuration.
   *
   * @deprecated Use `telemetry` instead. This alias will be removed in a future major release.
   */
  experimental_telemetry?: TelemetryOptions;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;

  /**
   * Maximum number of concurrent requests.
   *
   * Only takes effect when the model reports `supportsParallelCalls`.
   *
   * @default Infinity
   */
  maxParallelCalls?: number;

  /**
   * Callback that is called when the rerankMany operation begins,
   * before the reranking model is called.
   */
  onStart?: Callback<RerankStartEvent>;

  /**
   * Callback that is called when the rerankMany operation begins,
   * before the reranking model is called.
   *
   * @deprecated Use `onStart` instead.
   */
  experimental_onStart?: Callback<RerankStartEvent>;

  /**
   * Callback that is called when the rerankMany operation completes,
   * after all reranking model calls return.
   */
  onEnd?: Callback<RerankEndEvent>;

  /**
   * Callback that is called when the rerankMany operation completes,
   * after all reranking model calls return.
   *
   * @deprecated Use `onEnd` instead.
   */
  experimental_onEnd?: Callback<RerankEndEvent>;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    generateCallId?: () => string;
  };
}): Promise<RerankManyResult<VALUE>> {
  const model = resolveRerankingModel(modelArg);
  const callId = generateCallId();
  const resolvedOnStart = onStart ?? experimental_onStart;
  const resolvedOnEnd = onEnd ?? experimental_onEnd;

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const telemetryDispatcher = createTelemetryDispatcher({
    telemetry,
  });

  const runInTracingChannelSpan =
    telemetryDispatcher.runInTracingChannelSpan ??
    (async <T>({ execute }: { execute: () => PromiseLike<T> }) =>
      await execute());

  const startEvent = {
    callId,
    operationId: 'ai.rerankMany',
    provider: model.provider,
    modelId: model.modelId,
    documents,
    query,
    topN,
    maxRetries,
    headers,
    providerOptions,
  };

  return await runInTracingChannelSpan({
    type: 'rerankMany',
    event: startEvent,
    execute: async () => {
      await notify({
        event: startEvent,
        callbacks: [resolvedOnStart, telemetryDispatcher.onStart],
      });

      try {
        const [maxDocumentsPerCall, supportsParallelCalls] = await Promise.all([
          model.maxDocumentsPerCall,
          model.supportsParallelCalls,
        ]);

        const documentType: 'text' | 'object' =
          typeof documents[0] === 'string' ? 'text' : 'object';

        const toCallDocuments = (
          windowDocuments: Array<VALUE>,
        ): RerankingModelV4CallOptions['documents'] =>
          documentType === 'text'
            ? { type: 'text', values: windowDocuments as string[] }
            : { type: 'object', values: windowDocuments as JSONObject[] };

        // Split the documents into windows, keeping each window's offset in the
        // original list so window-local indices can be mapped back to global
        // indices after reranking.
        let documentWindows: Array<{
          documents: Array<VALUE>;
          offset: number;
        }>;
        if (
          documents.length === 0 ||
          maxDocumentsPerCall == null ||
          maxDocumentsPerCall === Infinity
        ) {
          documentWindows =
            documents.length === 0 ? [] : [{ documents, offset: 0 }];
        } else {
          let offset = 0;
          documentWindows = splitArray(documents, maxDocumentsPerCall).map(
            windowDocuments => {
              const window = { documents: windowDocuments, offset };
              offset += windowDocuments.length;
              return window;
            },
          );
        }

        const mergedRanking: Array<{ index: number; relevanceScore: number }> =
          [];
        const warnings: Array<Warning> = [];
        const responses: Array<{
          id?: string;
          timestamp: Date;
          modelId: string;
          headers?: Record<string, string>;
          body?: unknown;
        }> = [];
        let providerMetadata: ProviderMetadata | undefined;

        // Independent windows can be reranked in parallel when the model
        // supports it; otherwise they are sent one at a time.
        const parallelWindows = splitArray(
          documentWindows,
          supportsParallelCalls ? maxParallelCalls : 1,
        );

        for (const parallelWindow of parallelWindows) {
          const results = await Promise.all(
            parallelWindow.map(window =>
              retry(async () => {
                const rerankCallId = generateCallId();
                const callDocuments = toCallDocuments(window.documents);

                await notify({
                  event: {
                    callId,
                    rerankCallId,
                    operationId: 'ai.rerankMany.doRerank',
                    provider: model.provider,
                    modelId: model.modelId,
                    documents: window.documents,
                    documentsType: callDocuments.type,
                    query,
                    topN,
                  },
                  callbacks: [telemetryDispatcher.onRerankStart],
                });

                // topN is applied globally after merging, so each window is
                // scored in full rather than truncated on its own.
                const modelResponse = await model.doRerank({
                  documents: callDocuments,
                  query,
                  providerOptions,
                  abortSignal,
                  headers,
                });

                await notify({
                  event: {
                    callId,
                    rerankCallId,
                    operationId: 'ai.rerankMany.doRerank',
                    provider: model.provider,
                    modelId: model.modelId,
                    documentsType: callDocuments.type,
                    ranking: modelResponse.ranking,
                  },
                  callbacks: [telemetryDispatcher.onRerankEnd],
                });

                return { window, modelResponse };
              }),
            ),
          );

          for (const { window, modelResponse } of results) {
            for (const entry of modelResponse.ranking) {
              mergedRanking.push({
                index: window.offset + entry.index,
                relevanceScore: entry.relevanceScore,
              });
            }

            if (modelResponse.warnings) {
              warnings.push(...modelResponse.warnings);
            }

            responses.push({
              id: modelResponse.response?.id,
              timestamp: modelResponse.response?.timestamp ?? new Date(),
              modelId: modelResponse.response?.modelId ?? model.modelId,
              headers: modelResponse.response?.headers,
              body: modelResponse.response?.body,
            });

            if (modelResponse.providerMetadata) {
              if (!providerMetadata) {
                providerMetadata = { ...modelResponse.providerMetadata };
              } else {
                for (const [providerName, metadata] of Object.entries(
                  modelResponse.providerMetadata,
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

        mergedRanking.sort((a, b) => b.relevanceScore - a.relevanceScore);

        const limitedRanking =
          topN == null ? mergedRanking : mergedRanking.slice(0, topN);

        const ranking = limitedRanking.map(entry => ({
          originalIndex: entry.index,
          score: entry.relevanceScore,
          document: documents[entry.index],
        }));

        logWarnings({
          warnings,
          provider: model.provider,
          model: model.modelId,
        });

        await notify({
          event: {
            callId,
            operationId: 'ai.rerankMany',
            provider: model.provider,
            modelId: model.modelId,
            documents,
            query,
            ranking,
            warnings,
            providerMetadata,
            response: responses,
          },
          callbacks: [resolvedOnEnd, telemetryDispatcher.onEnd],
        });

        return new DefaultRerankManyResult({
          originalDocuments: documents,
          ranking,
          providerMetadata,
          responses,
        });
      } catch (error) {
        await telemetryDispatcher.onError?.({ callId, error });
        throw error;
      }
    },
  });
}

class DefaultRerankManyResult<VALUE> implements RerankManyResult<VALUE> {
  readonly originalDocuments: RerankManyResult<VALUE>['originalDocuments'];
  readonly ranking: RerankManyResult<VALUE>['ranking'];
  readonly providerMetadata: RerankManyResult<VALUE>['providerMetadata'];
  readonly responses: RerankManyResult<VALUE>['responses'];

  constructor(options: {
    originalDocuments: RerankManyResult<VALUE>['originalDocuments'];
    ranking: RerankManyResult<VALUE>['ranking'];
    providerMetadata?: RerankManyResult<VALUE>['providerMetadata'];
    responses?: RerankManyResult<VALUE>['responses'];
  }) {
    this.originalDocuments = options.originalDocuments;
    this.ranking = options.ranking;
    this.providerMetadata = options.providerMetadata;
    this.responses = options.responses;
  }

  get rerankedDocuments(): RerankManyResult<VALUE>['rerankedDocuments'] {
    return this.ranking.map(ranking => ranking.document);
  }
}
