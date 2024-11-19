// https://console.x.ai and see "View models"
export type XaiChatModelId = 'grok-beta' | 'grok-vision-beta' | (string & {});

export interface XaiChatSettings {
  /**
A unique identifier representing your end-user, which can help xAI to
monitor and detect abuse.
*/
  user?: string;
}
