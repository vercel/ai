import {
  ImagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from './content-part';

/**
A message that can be used in the `messages` field of a prompt. 
It can be a user message, an assistant message, or a tool message.
 */
export type CoreMessage =
  | CoreSystemMessage
  | CoreUserMessage
  | CoreAssistantMessage
  | CoreToolMessage;

/**
 A system message. It can contain system information.

 Note: using the "system" part of the prompt is strongly preferred
 to increase the resilience against prompt injection attacks,
 and because not all providers support several system messages.
 */
export type CoreSystemMessage = { role: 'system'; content: string };

/**
 * @deprecated Use `CoreMessage` instead.
 */
export type ExperimentalMessage = CoreMessage;

/**
A user message. It can contain text or a combination of text and images.
 */
export type CoreUserMessage = { role: 'user'; content: UserContent };

/**
 * @deprecated Use `CoreUserMessage` instead.
 */
export type ExperimentalUserMessage = CoreUserMessage;

/**
Content of a user message. It can be a string or an array of text and image parts.
 */
export type UserContent = string | Array<TextPart | ImagePart>;

/**
An assistant message. It can contain text, tool calls, or a combination of text and tool calls.
 */
export type CoreAssistantMessage = {
  role: 'assistant';
  content: AssistantContent;
};

/**
 * @deprecated Use `CoreAssistantMessage` instead.
 */
export type ExperimentalAssistantMessage = CoreAssistantMessage;

/**
Content of an assistant message. It can be a string or an array of text and tool call parts.
 */
export type AssistantContent = string | Array<TextPart | ToolCallPart>;

/**
A tool message. It contains the result of one or more tool calls.
 */
export type CoreToolMessage = { role: 'tool'; content: ToolContent };

/**
 * @deprecated Use `CoreToolMessage` instead.
 */
export type ExperimentalToolMessage = CoreToolMessage;

/**
Content of a tool message. It is an array of tool result parts.
 */
export type ToolContent = Array<ToolResultPart>;
