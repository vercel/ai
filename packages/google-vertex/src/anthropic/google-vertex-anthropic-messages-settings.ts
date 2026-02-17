import { AnthropicMessagesSettings } from '@ai-sdk/anthropic/internal';

// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude
export type GoogleVertexAnthropicMessagesModelId =
<<<<<<< HEAD:packages/google-vertex/src/anthropic/google-vertex-anthropic-messages-settings.ts
=======
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-5@20251101'
  | 'claude-sonnet-4-5@20250929'
  | 'claude-opus-4-1@20250805'
  | 'claude-opus-4@20250514'
  | 'claude-sonnet-4@20250514'
>>>>>>> fe42fd310 (Backport: feat(provider/anthropic): add support for new Claude Sonnet 4.6 model (#12648)):packages/google-vertex/src/anthropic/google-vertex-anthropic-messages-options.ts
  | 'claude-3-7-sonnet@20250219'
  | 'claude-3-5-sonnet-v2@20241022'
  | 'claude-3-5-haiku@20241022'
  | 'claude-3-5-sonnet@20240620'
  | 'claude-3-haiku@20240307'
  | 'claude-3-sonnet@20240229'
  | 'claude-3-opus@20240229'
  | (string & {});

export interface GoogleVertexAnthropicMessagesSettings
  extends AnthropicMessagesSettings {}
