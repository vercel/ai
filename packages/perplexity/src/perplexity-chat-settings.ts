import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://docs.perplexity.ai/guides/model-cards
export type PerplexityChatModelId = 'sonar-pro' | 'sonar' | (string & {});

export interface PerplexityChatSettings extends OpenAICompatibleChatSettings {}
