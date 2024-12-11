import { AnthropicMessagesSettings } from '@ai-sdk/anthropic/internal';

// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude
export type GoogleVertexAnthropicMessagesModelId =
  | 'claude-3-5-sonnet-v2@20241022'
  | 'claude-3-5-haiku@20241022'
  | 'claude-3-5-sonnet@20240620'
  | 'claude-3-haiku@20240307'
  | 'claude-3-sonnet@20240229'
  | 'claude-3-opus@20240229'
  | (string & {});

export interface GoogleVertexAnthropicMessagesSettings
  extends Omit<AnthropicMessagesSettings, 'cacheControl'> {}
