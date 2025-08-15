import { z } from 'zod/v4';
import { UIMessage } from './ui-messages';
import { validateTypes } from '@ai-sdk/provider-utils';

const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant']),
  metadata: z.unknown().optional(),
  parts: z.array(z.unknown()),
});

export async function validateUIMessages<UI_MESSAGE extends UIMessage>({
  messages,
}: {
  messages: unknown;
}): Promise<Array<UI_MESSAGE>> {
  const validatedMessages = await validateTypes({
    value: messages,
    schema: z.array(uiMessageSchema),
  });

  return validatedMessages as Array<UI_MESSAGE>;
}
