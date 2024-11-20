export type OpenAICompatibleChatModelId = string;

export interface OpenAICompatibleChatSettings {
  /**
A unique identifier representing your end-user, which can help the provider to
monitor and detect abuse.
  */
  user?: string;
}
