import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://console.x.ai and see "View models"
export type XaiChatModelId = 'grok-beta' | 'grok-vision-beta' | (string & {});

export interface XaiChatSettings extends OpenAICompatibleChatSettings {}
