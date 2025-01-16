import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://docs.venice.ai
export type VeniceChatModelId =
  | 'llama-3.2-3b'
  | 'llama-3.3-70b'
  | 'llama-3.1-405b'
  | 'dolphin-2.9.2-qwen2-72b'
  | 'qwen32b'
  | (string & {});

export interface VeniceParameters {
  /**
   * Whether to include Venice's platform system prompt in the response
   */
  include_venice_system_prompt?: boolean;
  // Add other Venice-specific parameters here as they become available
}

export interface VeniceChatSettings extends OpenAICompatibleChatSettings {
  /**
   * Venice-specific parameters that can be passed to the API
   */
  venice_parameters?: VeniceParameters;
} 