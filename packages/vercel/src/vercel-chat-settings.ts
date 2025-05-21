import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://vercel.com/models/text-generation
export type VercelChatModelId =
  | 'v0-1.0-md'
  | (string & {});

export interface VercelChatSettings extends OpenAICompatibleChatSettings {}
