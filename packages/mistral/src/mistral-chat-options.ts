import { z } from 'zod/v4';

// https://docs.mistral.ai/getting-started/models/models_overview/
export type MistralChatModelId =
  // premier
  | 'ministral-3b-latest'
  | 'ministral-8b-latest'
  | 'mistral-large-latest'
  | 'mistral-medium-latest'
  | 'mistral-medium-2505'
  | 'mistral-small-latest'
  | 'pixtral-large-latest'
  // reasoning models
  | 'magistral-small-2506'
  | 'magistral-medium-2506'
  // free
  | 'pixtral-12b-2409'
  // legacy
  | 'open-mistral-7b'
  | 'open-mixtral-8x7b'
  | 'open-mixtral-8x22b'
  | (string & {});

export const mistralProviderOptions = z.object({
  /**
Whether to inject a safety prompt before all conversations.

Defaults to `false`.
   */
  safePrompt: z.boolean().optional(),

  documentImageLimit: z.number().optional(),
  documentPageLimit: z.number().optional(),
});

export type MistralProviderOptions = z.infer<typeof mistralProviderOptions>;
