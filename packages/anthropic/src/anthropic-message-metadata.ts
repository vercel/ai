import { JSONObject } from '@ai-sdk/provider';

export interface AnthropicMessageMetadata {
  usage: JSONObject;
  // TODO remove cacheCreationInputTokens in AI SDK 6
  // (use value in usage object instead)
  cacheCreationInputTokens: number | null;
  stopSequence: string | null;
  container: {
    expiresAt: string;
    id: string;
    skills:
      | {
          type: 'anthropic' | 'custom';
          skillId: string;
          version: string;
        }[]
      | null;
  } | null;
}
