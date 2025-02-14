// https://docs.sambanova.ai/cloud/docs/get-started/supported-models#production-models
export type SambaNovaChatModelId =
  | 'Deepseek-R1-Distill-Llama-70B'
  | 'Llama-3.1-Tulu-3-405B'
  | 'Llama-3.3-70B-Instruct'
  | 'Llama-3.2-3B-Instruct'
  | 'Llama-3.2-1B-Instruct'
  | 'Llama-3.1-405B-Instruct'
  | 'Llama-3.1-70B-Instruct'
  | 'Llama-3.1-8B-Instruct'
  | 'Llama-3.2-90B-Vision-Instruct'
  | 'Llama-3.2-11B-Vision-Instruct'
  | 'Qwen2.5-72B-Instruct'
  | 'Qwen2.5-Coder-32B-Instruct'
  | 'QwQ-32B-Preview'
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
SambaNova supports image URLs for public models, so this is only needed for
private models or when the images are not publicly accessible.

Defaults to `false`.
   */
  downloadImages?: boolean;
}
