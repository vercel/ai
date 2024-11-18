// TODO(shaper): Need to generalize/fix the below to use an interface somehow.
// https://console.x.ai and see "View models"
export type OpenAICompatChatModelId = string;

export interface OpenAICompatChatSettings {
  /**
A unique identifier representing your end-user, which can help the provider to
monitor and detect abuse.
*/
  user?: string;
}
