export type OpenAICompatChatModelId = string;

export interface OpenAICompatChatSettings {
  /**
A unique identifier representing your end-user, which can help the provider to
monitor and detect abuse.
*/
  user?: string;
}
