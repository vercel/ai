import {
  ImagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from './content-part';

export type ExperimentalMessage =
  | ExperimentalUserMessage
  | ExperimentalAssistantMessage
  | ExperimentalToolMessage;

export type ExperimentalUserMessage = { role: 'user'; content: UserContent };
export type ExperimentalAssistantMessage = {
  role: 'assistant';
  content: AssistantContent;
};
export type ExperimentalToolMessage = { role: 'tool'; content: ToolContent };

export type UserContent = string | Array<TextPart | ImagePart>;
export type AssistantContent = string | Array<TextPart | ToolCallPart>;
export type ToolContent = Array<ToolResultPart>;
