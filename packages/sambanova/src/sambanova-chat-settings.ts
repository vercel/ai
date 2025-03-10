// https://console.groq.com/docs/models
// production models
export type SambaNovaChatModelId =
  | 'deepseek-r1-distill-llama-70b'
  | 'gemma2-9b-it'
  | 'gemma-7b-it'
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant'
  | 'llama-guard-3-8b'
  | 'llama3-70b-8192'
  | 'llama3-8b-8192'
  | 'mixtral-8x7b-32768'
  | 'llama-3.1-tulu-3-405b'
  | 'meta-llama-3.3-70b-instruct'
  | 'meta-llama-3.2-3b-instruct'
  | 'meta-llama-3.2-1b-instruct'
  | 'meta-llama-3.1-405b-instruct'
  | 'meta-llama-3.1-70b-instruct'
  | 'meta-llama-3.1-8b-instruct'
  | 'meta-llama-guard-3-8b'
  | 'llama-3.2-90b-vision-instruct'
  | 'llama-3.2-11b-vision-instruct'
  | 'qwen2.5-72b-instruct'
  | 'qwen2.5-coder-32b-instruct'
  | 'qwq-32b'
  | 'qwen2-audio-7b-instruct'
  | 'llama-3.1-swallow-8b-instruct-v0.3'
  | 'llama-3.1-swallow-70b-instruct-v0.3'
  | (string & {});

export interface SambaNovaChatSettings {
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
Sambanova supports image URLs for public models, so this is only needed for
private models or when the images are not publicly accessible.

Defaults to `false`.
   */
  downloadImages?: boolean;
}
