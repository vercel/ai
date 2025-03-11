// https://console.groq.com/docs/models
// production models
export type SambaNovaChatModelId =
  | 'Deepseek-R1-Distill-Llama-70b'
  | 'Gemma2-9b-It'
  | 'Gemma-7b-It'
  | 'Llama-3.3-70b-Versatile'
  | 'Llama-3.1-8b-Instant'
  | 'Llama-Guard-3-8b'
  | 'Llama3-70b-8192'
  | 'Llama3-8b-8192'
  | 'Mixtral-8x7b-32768'
  | 'Llama-3.1-Tulu-3-405b'
  | 'Meta-Llama-3.3-70b-Instruct'
  | 'Meta-Llama-3.2-3b-Instruct'
  | 'Meta-Llama-3.2-1b-Instruct'
  | 'Meta-Llama-3.1-405b-Instruct'
  | 'Meta-Llama-3.1-70b-Instruct'
  | 'Meta-Llama-3.1-8b-Instruct'
  | 'Meta-Llama-Guard-3-8b'
  | 'Llama-3.2-90b-Vision-Instruct'
  | 'Llama-3.2-11b-Vision-Instruct'
  | 'Qwen2.5-72b-Instruct'
  | 'Qwen2.5-Coder-32b-Instruct'
  | 'Qwq-32b'
  | 'Qwen2-Audio-7b-Instruct'
  | 'Llama-3.1-Swallow-8b-Instruct-V0.3'
  | 'Llama-3.1-Swallow-70b-Instruct-V0.3'
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
