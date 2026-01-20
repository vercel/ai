/**
 * Google Vertex AI MaaS (Model as a Service) model IDs.
 * These models use the OpenAI-compatible Chat Completions API.
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/maas/use-open-models
 */
export type GoogleVertexMaasModelId =
  // DeepSeek models
  | 'deepseek-ai/deepseek-r1-0528-maas'
  | 'deepseek-ai/deepseek-v3.1-maas'
  | 'deepseek-ai/deepseek-v3.2-maas'
  // GPT-OSS models
  | 'openai/gpt-oss-120b-maas'
  | 'openai/gpt-oss-20b-maas'
  // Llama models
  | 'meta/llama-4-maverick-17b-128e-instruct-maas'
  | 'meta/llama-4-scout-17b-16e-instruct-maas'
  // MiniMax models
  | 'minimax/minimax-m2-maas'
  // Qwen models
  | 'qwen/qwen3-coder-480b-a35b-instruct-maas'
  | 'qwen/qwen3-next-80b-a3b-instruct-maas'
  | 'qwen/qwen3-next-80b-a3b-thinking-maas'
  // Kimi models (MoonshotAI)
  | 'moonshotai/kimi-k2-instruct-0905-maas'
  // Allow arbitrary model strings
  | (string & {});
