import { JSONValue } from '@ai-sdk/provider';

export type MinimaxChatPrompt = Array<MinimaxMessage>;

export type MinimaxMessage =
  | MinimaxSystemMessage
  | MinimaxUserMessage
  | MinimaxAssistantMessage
  | MinimaxToolMessage;

type JsonRecord<T = never> = Record<
  string,
  JSONValue | JSONValue[] | T | T[] | undefined
>;

export interface MinimaxSystemMessage extends JsonRecord {
  role: 'system';
  content: string;
}

export interface MinimaxUserMessage
  extends JsonRecord<MinimaxContentPart> {
  role: 'user';
  content: string | Array<MinimaxContentPart>;
}

export type MinimaxContentPart =
  | MinimaxContentPartText
  | MinimaxContentPartImage;

export interface MinimaxContentPartImage extends JsonRecord {
  type: 'image_url';
  image_url: { url: string };
}

export interface MinimaxContentPartText extends JsonRecord {
  type: 'text';
  text: string;
}

export interface MinimaxAssistantMessage
  extends JsonRecord<MinimaxMessageToolCall> {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<MinimaxMessageToolCall>;
}

export interface MinimaxMessageToolCall extends JsonRecord {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface MinimaxToolMessage extends JsonRecord {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
