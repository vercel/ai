// Models served by the Neon AI Gateway. Anthropic, OpenAI, and Google models are
// routed to their provider-native endpoints; everything else uses the unified
// MLflow (OpenAI-compatible) endpoint.
//
// The authoritative, always-current catalog is shown in the Neon Console under
// the branch's "AI Gateway" tab. Any other id can be passed as a plain string
// via the `(string & {})` fallback.
export type NeonChatModelId =
  // Anthropic (native Messages API)
  | 'databricks-claude-opus-4-8'
  | 'databricks-claude-opus-4-7'
  | 'databricks-claude-opus-4-6'
  | 'databricks-claude-opus-4-5'
  | 'databricks-claude-opus-4-1'
  | 'databricks-claude-sonnet-4-6'
  | 'databricks-claude-sonnet-4-5'
  | 'databricks-claude-sonnet-4'
  | 'databricks-claude-haiku-4-5'
  // OpenAI (native Responses API, incl. Codex)
  | 'databricks-gpt-5'
  | 'databricks-gpt-5-mini'
  | 'databricks-gpt-5-nano'
  | 'databricks-gpt-5-1'
  | 'databricks-gpt-5-2'
  | 'databricks-gpt-5-2-codex'
  | 'databricks-gpt-5-3-codex'
  | 'databricks-gpt-5-4'
  | 'databricks-gpt-5-4-mini'
  | 'databricks-gpt-5-4-nano'
  | 'databricks-gpt-5-5'
  | 'databricks-gpt-5-5-pro'
  // OpenAI open-weight (unified MLflow endpoint)
  | 'databricks-gpt-oss-120b'
  | 'databricks-gpt-oss-20b'
  // Google (native Generative AI API)
  | 'databricks-gemini-3-5-flash'
  | 'databricks-gemini-3-1-flash-lite'
  | 'databricks-gemini-2-5-pro'
  | 'databricks-gemini-2-5-flash'
  | 'databricks-gemma-3-12b'
  // Meta (unified MLflow endpoint)
  | 'databricks-llama-4-maverick'
  | 'databricks-meta-llama-3-3-70b-instruct'
  | 'databricks-meta-llama-3-1-8b-instruct'
  // Alibaba (unified MLflow endpoint)
  | 'databricks-qwen3-next-80b-a3b-instruct'
  | 'databricks-qwen35-122b-a10b'
  | (string & {});
