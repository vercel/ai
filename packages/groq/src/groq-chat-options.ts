import { z } from 'zod/v4';

// https://console.groq.com/docs/models
export type GroqChatModelId =
  // production models
  | 'gemma2-9b-it'
  | 'llama-3.1-8b-instant'
  | 'llama-3.3-70b-versatile'
  | 'meta-llama/llama-guard-4-12b'
  | 'openai/gpt-oss-120b'
  | 'openai/gpt-oss-20b'
  // preview models (selection)
  | 'deepseek-r1-distill-llama-70b'
  | 'meta-llama/llama-4-maverick-17b-128e-instruct'
  | 'meta-llama/llama-4-scout-17b-16e-instruct'
  | 'meta-llama/llama-prompt-guard-2-22m'
  | 'meta-llama/llama-prompt-guard-2-86m'
  | 'mistral-saba-24b'
  | 'moonshotai/kimi-k2-instruct'
  | 'qwen/qwen3-32b'
  | 'llama-guard-3-8b'
  | 'llama3-70b-8192'
  | 'llama3-8b-8192'
  | 'mixtral-8x7b-32768'
  | 'qwen-qwq-32b'
  | 'qwen-2.5-32b'
  | 'deepseek-r1-distill-qwen-32b'
  | (string & {});

export const groqProviderOptions = z.object({
  reasoningFormat: z.enum(['parsed', 'raw', 'hidden']).optional(),
  reasoningEffort: z.string().optional(),

  /**
   * Whether to enable parallel function calling during tool use. Default to true.
   */
  parallelToolCalls: z.boolean().optional(),

  /**
   * A unique identifier representing your end-user, which can help OpenAI to
   * monitor and detect abuse. Learn more.
   */
  user: z.string().optional(),

  /**
   * Whether to use structured outputs.
   *
   * @default true
   */
  structuredOutputs: z.boolean().optional(),
});

export type GroqProviderOptions = z.infer<typeof groqProviderOptions>;
