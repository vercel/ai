// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude
export type GoogleVertexAnthropicMessagesModelId =
  | 'claude-opus-4-1@20250805'
  | 'claude-opus-4@20250514'
  | 'claude-sonnet-4@20250514'
  | 'claude-3-7-sonnet@20250219'
  | 'claude-3-5-sonnet-v2@20241022'
  | 'claude-3-5-haiku@20241022'
  | 'claude-3-5-sonnet@20240620'
  | 'claude-3-haiku@20240307'
  | 'claude-3-sonnet@20240229'
  | 'claude-3-opus@20240229'
  | (string & {});
