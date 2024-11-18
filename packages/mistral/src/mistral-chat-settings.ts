// https://docs.mistral.ai/getting-started/models/models_overview/
export type MistralChatModelId =
  // premier
  | 'ministral-3b-latest'
  | 'ministral-8b-latest'
  | 'mistral-large-latest'
  | 'mistral-small-latest'
  | 'pixtral-large-latest'
  // free
  | 'pixtral-12b-2409'
  // legacy
  | 'open-mistral-7b'
  | 'open-mixtral-8x7b'
  | 'open-mixtral-8x22b'
  | (string & {});

export interface MistralChatSettings {
  /**
Whether to inject a safety prompt before all conversations.

Defaults to `false`.
   */
  safePrompt?: boolean;
}
