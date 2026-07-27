import { z } from 'zod/v4';

export const mistralLanguageModelConversationsOptions = z.object({
  /**
   * Whether Mistral should persist the conversation.
   *
   * Set to `false` to create a non-persistent conversation.
   */
  store: z.boolean().optional(),
});

export type MistralLanguageModelConversationsOptions = z.infer<
  typeof mistralLanguageModelConversationsOptions
>;
