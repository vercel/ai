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
export type ExperimentalMessage =
  | ExperimentalUserMessage
  | ExperimentalAssistantMessage
  | ExperimentalToolMessage;

/**
A user message. It can contain text or a combination of text and images.
 */
export type ExperimentalUserMessage = { role: 'user'; content: UserContent };

/**
Content of a user message. It can be a string or an array of text and image parts.
 */
export type UserContent = string | Array<TextPart | ImagePart>;

/**
An assistant message. It can contain text, tool calls, or a combination of text and tool calls.
 */
export type ExperimentalAssistantMessage = {
  role: 'assistant';
  content: AssistantContent;
};

/**
Content of an assistant message. It can be a string or an array of text and tool call parts.
 */
export type AssistantContent = string | Array<TextPart | ToolCallPart>;

/**
A tool message. It contains the result of one or more tool calls.
 */
export type ExperimentalToolMessage = { role: 'tool'; content: ToolContent };

/**
Content of a tool message. It is an array of tool result parts.
 */
export type ToolContent = Array<ToolResultPart>;
