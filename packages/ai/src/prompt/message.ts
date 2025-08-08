import {
  AssistantModelMessage,
  ModelMessage,
  SystemModelMessage,
  ToolModelMessage,
  UserModelMessage,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { providerMetadataSchema } from '../types/provider-metadata';
import {
  filePartSchema,
  imagePartSchema,
  reasoningPartSchema,
  textPartSchema,
  toolCallPartSchema,
  toolResultPartSchema,
} from './content-part';

/**
@deprecated Use `SystemModelMessage` instead.
 */
// TODO remove in AI SDK 6
export type CoreSystemMessage = SystemModelMessage;

export const systemModelMessageSchema: z.ZodType<SystemModelMessage> = z.object(
  {
    role: z.literal('system'),
    content: z.string(),
    providerOptions: providerMetadataSchema.optional(),
  },
);

/**
@deprecated Use `systemModelMessageSchema` instead.
 */
// TODO remove in AI SDK 6
export const coreSystemMessageSchema = systemModelMessageSchema;

/**
@deprecated Use `UserModelMessage` instead.
 */
// TODO remove in AI SDK 6
export type CoreUserMessage = UserModelMessage;

export const userModelMessageSchema: z.ZodType<UserModelMessage> = z.object({
  role: z.literal('user'),
  content: z.union([
    z.string(),
    z.array(z.union([textPartSchema, imagePartSchema, filePartSchema])),
  ]),
  providerOptions: providerMetadataSchema.optional(),
});

/**
@deprecated Use `userModelMessageSchema` instead.
 */
// TODO remove in AI SDK 6
export const coreUserMessageSchema = userModelMessageSchema;

/**
@deprecated Use `AssistantModelMessage` instead.
 */
// TODO remove in AI SDK 6
export type CoreAssistantMessage = AssistantModelMessage;

export const assistantModelMessageSchema: z.ZodType<AssistantModelMessage> =
  z.object({
    role: z.literal('assistant'),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          textPartSchema,
          filePartSchema,
          reasoningPartSchema,
          toolCallPartSchema,
          toolResultPartSchema,
        ]),
      ),
    ]),
    providerOptions: providerMetadataSchema.optional(),
  });

/**
@deprecated Use `assistantModelMessageSchema` instead.
 */
// TODO remove in AI SDK 6
export const coreAssistantMessageSchema = assistantModelMessageSchema;

/**
@deprecated Use `ToolModelMessage` instead.
 */
// TODO remove in AI SDK 6
export type CoreToolMessage = ToolModelMessage;

export const toolModelMessageSchema: z.ZodType<ToolModelMessage> = z.object({
  role: z.literal('tool'),
  content: z.array(toolResultPartSchema),
  providerOptions: providerMetadataSchema.optional(),
});

/**
@deprecated Use `toolModelMessageSchema` instead.
 */
// TODO remove in AI SDK 6
export const coreToolMessageSchema = toolModelMessageSchema;

/**
@deprecated Use `ModelMessage` instead.
   */
// TODO remove in AI SDK 6
export type CoreMessage = ModelMessage;

export const modelMessageSchema: z.ZodType<ModelMessage> = z.union([
  systemModelMessageSchema,
  userModelMessageSchema,
  assistantModelMessageSchema,
  toolModelMessageSchema,
]);

/**
@deprecated Use `modelMessageSchema` instead.
 */
// TODO remove in AI SDK 6
export const coreMessageSchema: z.ZodType<CoreMessage> = modelMessageSchema;
