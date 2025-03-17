import { z } from 'zod';
import { ProviderMetadata } from '../types';
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
  RedactedReasoningPart,
  redactedReasoningPartSchema,
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
export type CoreSystemMessage = {
  role: 'system';
  content: string;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;

  /**
@deprecated Use `providerOptions` instead.
 */
  experimental_providerMetadata?: ProviderMetadata;
};

export const coreSystemMessageSchema: z.ZodType<CoreSystemMessage> = z.object({
  role: z.literal('system'),
  content: z.string(),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional(),
});

/**
A user message. It can contain text or a combination of text and images.
 */
export type CoreUserMessage = {
  role: 'user';
  content: UserContent;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;

  /**
@deprecated Use `providerOptions` instead.
*/
  experimental_providerMetadata?: ProviderMetadata;
};

export const coreUserMessageSchema: z.ZodType<CoreUserMessage> = z.object({
  role: z.literal('user'),
  content: z.union([
    z.string(),
    z.array(z.union([textPartSchema, imagePartSchema, filePartSchema])),
  ]),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional(),
});

/**
Content of a user message. It can be a string or an array of text and image parts.
 */
export type UserContent = string | Array<TextPart | ImagePart | FilePart>;

/**
An assistant message. It can contain text, tool calls, or a combination of text and tool calls.
 */
export type CoreAssistantMessage = {
  role: 'assistant';
  content: AssistantContent;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;

  /**
@deprecated Use `providerOptions` instead.
*/
  experimental_providerMetadata?: ProviderMetadata;
};

export const coreAssistantMessageSchema: z.ZodType<CoreAssistantMessage> =
  z.object({
    role: z.literal('assistant'),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          textPartSchema,
          filePartSchema,
          reasoningPartSchema,
          redactedReasoningPartSchema,
          toolCallPartSchema,
        ]),
      ),
    ]),
    providerOptions: providerMetadataSchema.optional(),
    experimental_providerMetadata: providerMetadataSchema.optional(),
  });

/**
Content of an assistant message.
It can be a string or an array of text, image, reasoning, redacted reasoning, and tool call parts.
 */
export type AssistantContent =
  | string
  | Array<
      TextPart | FilePart | ReasoningPart | RedactedReasoningPart | ToolCallPart
    >;

/**
A tool message. It contains the result of one or more tool calls.
 */
export type CoreToolMessage = {
  role: 'tool';
  content: ToolContent;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
  providerOptions?: ProviderOptions;

  /**
@deprecated Use `providerOptions` instead.
*/
  experimental_providerMetadata?: ProviderMetadata;
};

export const coreToolMessageSchema: z.ZodType<CoreToolMessage> = z.object({
  role: z.literal('tool'),
  content: z.array(toolResultPartSchema),
  providerOptions: providerMetadataSchema.optional(),
  experimental_providerMetadata: providerMetadataSchema.optional(),
});

/**
Content of a tool message. It is an array of tool result parts.
 */
export type ToolContent = Array<ToolResultPart>;

/**
A message that can be used in the `messages` field of a prompt.
It can be a user message, an assistant message, or a tool message.
 */
export type CoreMessage =
  | CoreSystemMessage
  | CoreUserMessage
  | CoreAssistantMessage
  | CoreToolMessage;

export const coreMessageSchema: z.ZodType<CoreMessage> = z.union([
  coreSystemMessageSchema,
  coreUserMessageSchema,
  coreAssistantMessageSchema,
  coreToolMessageSchema,
]);
