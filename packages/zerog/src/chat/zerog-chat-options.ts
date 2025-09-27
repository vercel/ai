import { z } from 'zod';

export type ZeroGChatModelId = 
  | 'llama-3.3-70b-instruct'
  | 'deepseek-r1-70b'
  | (string & {});

export const zerogProviderOptions = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),

  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: z.string().optional(),
});

export type ZeroGProviderOptions = z.infer<typeof zerogProviderOptions>;
