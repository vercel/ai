import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://console.x.ai and see "View models"
export type XaiChatModelId =
  | 'grok-beta'
  | 'grok-vision-beta'
  | 'grok-2-1212'
  | 'grok-2-vision-1212'
  | (string & {});

export interface XaiChatSettings extends OpenAICompatibleChatSettings {}
