import { OpenAICompatibleCompletionSettings } from '@ai-sdk/openai-compatible';
import { DeepInfraChatModelId } from './deepinfra-chat-settings';

// Use the same model IDs as chat
export type DeepInfraCompletionModelId = DeepInfraChatModelId;

export interface DeepInfraCompletionSettings
  extends OpenAICompatibleCompletionSettings {}
