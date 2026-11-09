import type {
  AssistantModelMessage,
  ModelMessage,
  SystemModelMessage,
  ToolModelMessage,
  UserModelMessage,
} from '@ai-sdk/provider-utils';
import { providerMetadataSchema } from '../types/provider-metadata';
import { z, type ZodType } from '../util/zod';
import {
  customPartSchema,
  filePartSchema,
  imagePartSchema,
  reasoningFilePartSchema,
  reasoningPartSchema,
  textPartSchema,
  toolApprovalRequestSchema,
  toolCallPartSchema,
  toolApprovalResponseSchema,
  toolResultPartSchema,
} from './content-part';

export const systemModelMessageSchema: ZodType<SystemModelMessage> = z.object({
  role: z.literal('system'),
  content: z.string(),
  providerOptions: z.optional(providerMetadataSchema),
});

export const userModelMessageSchema: ZodType<UserModelMessage> = z.object({
  role: z.literal('user'),
  content: z.union([
    z.string(),
    z.array(z.union([textPartSchema, imagePartSchema, filePartSchema])),
  ]),
  providerOptions: z.optional(providerMetadataSchema),
});

export const assistantModelMessageSchema: ZodType<AssistantModelMessage> =
  z.object({
    role: z.literal('assistant'),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          textPartSchema,
          customPartSchema,
          filePartSchema,
          reasoningPartSchema,
          reasoningFilePartSchema,
          toolCallPartSchema,
          toolResultPartSchema,
          toolApprovalRequestSchema,
        ]),
      ),
    ]),
    providerOptions: z.optional(providerMetadataSchema),
  });

export const toolModelMessageSchema: ZodType<ToolModelMessage> = z.object({
  role: z.literal('tool'),
  content: z.array(z.union([toolResultPartSchema, toolApprovalResponseSchema])),
  providerOptions: z.optional(providerMetadataSchema),
});

export const modelMessageSchema: ZodType<ModelMessage> = z.union([
  systemModelMessageSchema,
  userModelMessageSchema,
  assistantModelMessageSchema,
  toolModelMessageSchema,
]);
