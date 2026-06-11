// Models served by the Neon AI Gateway unified (MLflow) endpoint.
//
// The authoritative, always-current catalog is shown in the Neon Console under
// the branch's "AI Gateway" tab. The list below covers the commonly available
// `databricks-*` model ids; any other id can be passed as a plain string via
// the `(string & {})` fallback.
export type NeonChatModelId =
  // Anthropic
  | 'databricks-claude-opus-4-8'
  | 'databricks-claude-sonnet-4-6'
  | 'databricks-claude-sonnet-4-5'
  | 'databricks-claude-haiku-4-5'
  // OpenAI
  | 'databricks-gpt-5'
  | 'databricks-gpt-5-mini'
  | 'databricks-gpt-5-nano'
  // Google
  | 'databricks-gemini-2-5-pro'
  | 'databricks-gemini-2-5-flash'
  // Meta
  | 'databricks-llama-4-maverick'
  | 'databricks-meta-llama-3-3-70b-instruct'
  | (string & {});
