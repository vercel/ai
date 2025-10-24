import { z } from 'zod/v4';

export type OpenAICompatibleResponsesModelId = string;

export const openaiCompatibleResponsesProviderOptions = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),
  include: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  reasoningEffort: z.string().nullish(),
  reasoningSummary: z.string().nullish(),
  store: z.boolean().optional(),
  strictJsonSchema: z.boolean().optional(),
});

export type OpenAICompatibleResponsesProviderOptions = z.infer<
  typeof openaiCompatibleResponsesProviderOptions
>;
