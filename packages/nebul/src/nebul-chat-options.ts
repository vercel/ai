/**
 * Nebul chat model ids from the Nebul Model Catalog,
 * https://docs.nebul.io/docs/inference-api/models/model-catalog
 * retrieved on 2026-09-08. The catalog evolves continuously, so the
 * type allows arbitrary model ids.
 */
export type NebulChatModelId =
  | 'zai-org/GLM-5.3-Flash'
  | 'zai-org/GLM-5.3'
  | 'zai-org/GLM-5.2-FP8'
  | 'zai-org/GLM-5.1-FP8'
  | 'openai/gpt-oss-120b'
  | 'Qwen/Qwen3.5-397B-A17B'
  | 'moonshotai/Kimi-K3'
  | 'mistralai/Mistral-Large-3-675B-Instruct-2512'
  | 'google/gemma-4-31B-it'
  | (string & {});
