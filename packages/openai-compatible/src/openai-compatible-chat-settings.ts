export type OpenAICompatibleChatModelId = string;

export interface OpenAICompatibleChatSettings {
  /**
A unique identifier representing your end-user, which can help the provider to
monitor and detect abuse.
  */
  user?: string;

  /**
Simulates streaming by using a normal generate call and returning it as a stream.
Enable this if the model that you are using does not support streaming.

Defaults to `false`.
   */
  simulateStreaming?: boolean;
}
