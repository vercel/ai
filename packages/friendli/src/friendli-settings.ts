import {
  OpenAICompatibleChatSettings,
  OpenAICompatibleCompletionSettings,
} from '@ai-sdk/openai-compatible';

// https://friendli.ai/products/serverless-endpoints
// Below is just a subset of the available models.
export type FriendliAILanguageModelId =
  | 'meta-llama-3.1-8b-instruct'
  | 'meta-llama-3.1-70b-instruct'
  | 'mixtral-8x7b-instruct-v0-1'
  | (string & {});

export type FriendliAIBetaChatModelId =
  | 'llama-3.2-11b-vision-instruct'
  | (string & {});

export interface FriendliAIChatSettings extends OpenAICompatibleChatSettings {
  /**
   BETA FEATURE: Include the model's training loss in the response.
   */
  tools?: Array<{
    type:
      | 'web:url'
      | 'web:search'
      | 'math:calendar'
      | 'math:statistics'
      | 'math:calculator'
      | 'code:python-interpreter';
  }>;

  /**
  BETA FEATURE: You can write a regular expression to force output that satisfies that regular expression.
  */
  regex?: string;

  /**
   * Enable this option if you want to use it on a dedicated endpoint.
   */
  dedicated?: boolean;
}

export interface FriendliAICompletionSettings
  extends OpenAICompatibleCompletionSettings {
  /**
   * Enable this option if you want to use it on a dedicated endpoint.
   */
  dedicated?: boolean;
}
