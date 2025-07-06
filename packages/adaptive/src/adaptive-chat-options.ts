// Adaptive chat model options/types

import { z } from 'zod/v4';

// --- Provider/model type inference ---
export const PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'groq',
  'grok',
] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const MODELS: Record<ProviderName, readonly string[]> = {
  openai: [
    'gpt-3.5-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4',
    'gpt-4-turbo',
    'o3',
    'o3-mini',
    'o4-mini',
  ],
  anthropic: [
    'claude-3.5-sonnet',
    'claude-3.5-haiku',
    'claude-3-opus',
    'claude-4-sonnet',
  ],
  google: [
    'gemini-2.5-pro',
    'gemini-2.5-pro-large',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-pro',
  ],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: [
    'llama-4-scout-17b-16e-instruct',
    'llama-4-maverick-17b-128e-instruct',
    'llama-guard-4-12b',
    'deepseek-r1-distill-llama-70b',
    'qwen-qwq-32b',
    'mistral-saba-24b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama3-70b-8192',
    'llama3-8b-8192',
    'mixtral-8x7b-32768',
    'gemma-7b-it',
    'gemma2-9b-it',
  ],
  grok: ['grok-3', 'grok-3-mini', 'grok-3-fast', 'grok-beta'],
} as const;

// --- End provider/model type inference ---

/**
 * The model ID for Adaptive chat models in providername-modelname format.
 * Examples: "openai-gpt-4", "anthropic-claude-3.5-sonnet", "google-gemini-2.5-pro"
 */
export type AdaptiveChatModelId =
  | {
      [P in ProviderName]: `${P}-${(typeof MODELS)[P][number]}`;
    }[ProviderName]
  | (string & {});

/**
 * Provider options for Adaptive chat models.
 */
export const adaptiveProviderOptions = z.object({
  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   * Accepts a JSON object that maps tokens (specified by their token ID) to a bias value from -100 to 100.
   */
  logitBias: z.record(z.string(), z.number()).optional(),
  /**
   * Number of completions to generate for each prompt.
   */
  n: z.number().optional(),
  /**
   * Whether to stream responses.
   */
  stream: z.boolean().optional(),
  /**
   * Unique identifier representing your end-user.
   */
  user: z.string().optional(),
  /**
   * Cost bias for optimization.
   */
  costBias: z.number().optional(),
});

/**
 * Type for validated Adaptive provider options.
 */
export type AdaptiveProviderOptions = z.infer<typeof adaptiveProviderOptions>;
