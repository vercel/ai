// https://console.groq.com/docs/models
export type GroqChatModelId =
  // production models
  | 'gemma2-9b-it'
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant'
  | 'llama-guard-3-8b'
  | 'llama3-70b-8192'
  | 'llama3-8b-8192'
  | 'mixtral-8x7b-32768'
  // preview models (selection)
  | 'meta-llama/llama-4-scout-17b-16e-instruct'
  | 'qwen-qwq-32b'
  | 'mistral-saba-24b'
  | 'qwen-2.5-32b'
  | 'deepseek-r1-distill-qwen-32b'
  | 'deepseek-r1-distill-llama-70b'
  | (string & {});

export interface GroqChatSettings {
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
Groq supports image URLs for public models, so this is only needed for
private models or when the images are not publicly accessible.

Defaults to `false`.
   */
  downloadImages?: boolean;
}
