import { z } from 'zod';
import {
  providerMetadataSchema,
  ProviderOptions,
} from '../types/provider-metadata';
import {
  FilePart,
  filePartSchema,
  ImagePart,
  imagePartSchema,
  ReasoningPart,
  reasoningPartSchema,
  TextPart,
  textPartSchema,
  ToolCallPart,
  toolCallPartSchema,
  ToolResultPart,
  toolResultPartSchema,
} from './content-part';

/**
 A system message. It can contain system information.

 Note: using the "system" part of the prompt is strongly preferred
 to increase the resilience against prompt injection attacks,
 and because not all providers support several system messages.
 */
export type SystemModelMessage = {
  role: 'system';
  content: string;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;
};

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
A user message. It can contain text or a combination of text and images.
 */
export type UserModelMessage = {
  role: 'user';
  content: UserContent;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;
};

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
Content of a user message. It can be a string or an array of text and image parts.
 */
export type UserContent = string | Array<TextPart | ImagePart | FilePart>;

/**
An assistant message. It can contain text, tool calls, or a combination of text and tool calls.
 */
export type AssistantModelMessage = {
  role: 'assistant';
  content: AssistantContent;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;
};

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
Content of an assistant message.
It can be a string or an array of text, image, reasoning, redacted reasoning, and tool call parts.
 */
export type AssistantContent =
  | string
  | Array<TextPart | FilePart | ReasoningPart | ToolCallPart>;

/**
A tool message. It contains the result of one or more tool calls.
 */
export type ToolModelMessage = {
  role: 'tool';
  content: ToolContent;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;
};

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
Content of a tool message. It is an array of tool result parts.
 */
export type ToolContent = Array<ToolResultPart>;

/**
A message that can be used in the `messages` field of a prompt.
It can be a user message, an assistant message, or a tool message.
 */
export type ModelMessage =
  | SystemModelMessage
  | UserModelMessage
  | AssistantModelMessage
  | ToolModelMessage;

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
