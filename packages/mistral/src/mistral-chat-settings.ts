// https://docs.mistral.ai/platform/endpoints/
export type MistralChatModelId =
  | 'open-mistral-7b'
  | 'open-mixtral-8x7b'
  | 'open-mixtral-8x22b'
  | 'open-mistral-nemo'
  | 'pixtral-12b-2409'
  | 'mistral-small-latest'
  | 'mistral-large-latest'
  | (string & {});

export interface MistralChatSettings {
  /**
Whether to inject a safety prompt before all conversations.

Defaults to `false`.
   */
  safePrompt?: boolean;
}
