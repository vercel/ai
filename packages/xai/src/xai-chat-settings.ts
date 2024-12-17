import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://console.x.ai and see "View models"
export type XaiChatModelId =
  | 'grok-2-1212'
  | 'grok-2-vision-1212'
  | 'grok-beta'
  | 'grok-vision-beta'
  | (string & {});

export interface XaiChatSettings extends OpenAICompatibleChatSettings {}
