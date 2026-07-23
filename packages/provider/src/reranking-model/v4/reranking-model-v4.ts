import type { RerankingModelV4CallOptions } from './reranking-model-v4-call-options';
import type { RerankingModelV4Result } from './reranking-model-v4-result';

/**
 * Specification for a reranking model that implements the reranking model interface version 3.
 */
export type RerankingModelV4 = {
  /**
   * The reranking model must specify which reranking model interface version it implements.
   */
  readonly specificationVersion: 'v4';

  /**
   * Provider ID.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID.
   */
  readonly modelId: string;

  /**
   * Limit of how many documents can be reranked in a single API call.
   *
   * Use Infinity for models that do not have a limit. When omitted, the
   * document set is sent in a single call. `rerankMany` uses this to split
   * larger document sets across multiple calls.
   */
  readonly maxDocumentsPerCall?:
    | PromiseLike<number | undefined>
    | number
    | undefined;

  /**
   * True if the model can handle multiple reranking calls in parallel.
   *
   * `rerankMany` uses this to decide whether the document windows produced by
   * `maxDocumentsPerCall` may be sent concurrently. When omitted, the windows
   * are sent sequentially.
   */
  readonly supportsParallelCalls?: PromiseLike<boolean> | boolean;

  /**
   * Reranking a list of documents using the query.
   */
  // Naming: "do" prefix to prevent accidental direct usage of the method by the user.
  doRerank(
    options: RerankingModelV4CallOptions,
  ): PromiseLike<RerankingModelV4Result>;
};
