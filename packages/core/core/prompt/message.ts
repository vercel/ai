import {
  ImagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from './content-part';

export type Message = UserMessage | AssistantMessage | ToolMessage;

export type UserMessage = { role: 'user'; content: UserContent };
export type AssistantMessage = { role: 'assistant'; content: AssistantContent };
export type ToolMessage = { role: 'tool'; content: ToolContent };

export type UserContent = string | Array<TextPart | ImagePart>;
export type AssistantContent = string | Array<TextPart | ToolCallPart>;
export type ToolContent = Array<ToolResultPart>;
