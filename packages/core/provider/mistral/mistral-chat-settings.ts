export type MistralChatModelId =
  | 'open-mistral-7b'
  | 'open-mixtral-8x7b'
  | 'mistral-small-latest'
  | 'mistral-medium-latest'
  | 'mistral-large-latest'
  | (string & {});

export interface MistralChatSettings {
  /**
   * The ID of the model to use.
   */
  id: MistralChatModelId;

  /**
   * Whether to inject a safety prompt before all conversations.
   *
   * Default: false
   */
  safePrompt?: boolean;
}
