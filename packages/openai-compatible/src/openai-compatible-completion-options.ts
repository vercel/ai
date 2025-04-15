import { z } from 'zod';

export type OpenAICompatibleCompletionModelId = string;

export const openaiCompatibleCompletionProviderOptions = z.object({
  /**
   * Echo back the prompt in addition to the completion.
   */
  echo: z.boolean().optional(),

  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   *
   * Accepts a JSON object that maps tokens (specified by their token ID in
   * the GPT tokenizer) to an associated bias value from -100 to 100.
   */
  logitBias: z.record(z.number(), z.number()).optional(),

  /**
   * The suffix that comes after a completion of inserted text.
   */
  suffix: z.string().optional(),

  /**
   * A unique identifier representing your end-user, which can help providers to
   * monitor and detect abuse.
   */
  user: z.string().optional(),
});

export type OpenAICompatibleCompletionProviderOptions = z.infer<
  typeof openaiCompatibleCompletionProviderOptions
>;
