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

const sourceUrlUIPartSchema = z.object({
  type: z.literal('source-url'),
  sourceId: z.string(),
  url: z.string(),
  title: z.string().optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const sourceDocumentUIPartSchema = z.object({
  type: z.literal('source-document'),
  sourceId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  filename: z.string().optional(),
  providerMetadata: providerMetadataSchema.optional(),
});

const fileUIPartSchema = z.object({
  type: z.literal('file'),
  mediaType: z.string(),
  filename: z.string().optional(),
  url: z.string(),
  providerMetadata: providerMetadataSchema.optional(),
});

const stepStartUIPartSchema = z.object({
  type: z.literal('step-start'),
});

const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant']),
  metadata: z.unknown().optional(),
  parts: z.array(
    z.discriminatedUnion('type', [
      textUIPartSchema,
      reasoningUIPartSchema,
      sourceUrlUIPartSchema,
      sourceDocumentUIPartSchema,
      fileUIPartSchema,
      stepStartUIPartSchema,
    ]),
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
