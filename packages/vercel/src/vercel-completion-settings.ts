import { OpenAICompatibleCompletionSettings } from '@ai-sdk/openai-compatible';
import { VercelChatModelId } from './vercel-chat-settings';

// Use the same model IDs as chat
export type VercelCompletionModelId = VercelChatModelId;

export interface VercelCompletionSettings
  extends OpenAICompatibleCompletionSettings {}
