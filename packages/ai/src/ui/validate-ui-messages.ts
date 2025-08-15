import {
  StandardSchemaV1,
  validateTypes,
  Validator,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { providerMetadataSchema } from '../types/provider-metadata';
import { UIMessage } from './ui-messages';

const textUIPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  state: z.enum(['streaming', 'done']).optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const reasoningUIPartSchema = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
  state: z.enum(['streaming', 'done']).optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant']),
  metadata: z.unknown().optional(),
  parts: z.array(
    z.discriminatedUnion('type', [textUIPartSchema, reasoningUIPartSchema]),
  ),
});

export async function validateUIMessages<UI_MESSAGE extends UIMessage>({
  messages,
  metadataSchema,
}: {
  messages: unknown;
  metadataSchema?:
    | Validator<UIMessage['metadata']>
    | StandardSchemaV1<unknown, UI_MESSAGE['metadata']>;
}): Promise<Array<UI_MESSAGE>> {
  const validatedMessages = await validateTypes({
    value: messages,
    schema: z.array(uiMessageSchema),
  });

  if (metadataSchema) {
    for (const message of validatedMessages) {
      await validateTypes({
        value: message.metadata,
        schema: metadataSchema,
      });
    }
  }

  return validatedMessages as Array<UI_MESSAGE>;
}
