/**
 * Nebul reranking model ids from the Nebul Model Catalog,
 * https://docs.nebul.com/docs/inference-api/models/model-catalog
 * retrieved on 2026-09-08. The catalog evolves continuously, so the
 * type allows arbitrary model ids.
 */
export type NebulRerankingModelId = 'BAAI/bge-reranker-v2-m3' | (string & {});
