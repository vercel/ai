import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://console.x.ai and see "View models"
export type XaiChatModelId =
  | 'grok-3-beta'
  | 'grok-3-fast-beta'
  | 'grok-3-mini-beta'
  | 'grok-3-mini-fast-beta'
  | 'grok-2-1212'
  | 'grok-2-vision-1212'
  | 'grok-beta'
  | 'grok-vision-beta'
  | (string & {});

export interface XaiChatSettings extends OpenAICompatibleChatSettings {}

export function supportsStructuredOutputs(modelId: XaiChatModelId) {
  return [
    'grok-3-beta',
    'grok-3-fast-beta',
    'grok-3-mini-beta',
    'grok-3-mini-fast-beta',
    'grok-2-1212',
    'grok-2-vision-1212'
  ].includes(modelId);
}
