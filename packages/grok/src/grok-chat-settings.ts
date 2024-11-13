// https://console.x.ai and see "View models"
export type GrokChatModelId = 'grok-beta' | (string & {});

export interface GrokChatSettings {
  /**
Whether to enable parallel function calling during tool use. Default to true.
   */
  parallelToolCalls?: boolean;

  /**
A unique identifier representing your end-user, which can help OpenAI to
monitor and detect abuse. Learn more.
*/
  user?: string;

  /**
Automatically download images and pass the image as data to the model.
Grok supports image URLs for public models, so this is only needed for
private models or when the images are not publicly accessible.

Defaults to `false`.
   */
  downloadImages?: boolean;
}
