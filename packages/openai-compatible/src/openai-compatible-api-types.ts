export type OpenAICompatibleChatPrompt = Array<OpenAICompatibleMessage>;

export type OpenAICompatibleMessage =
  | OpenAICompatibleSystemMessage
  | OpenAICompatibleUserMessage
  | OpenAICompatibleAssistantMessage
  | OpenAICompatibleToolMessage;

export interface OpenAICompatibleSystemMessage {
  role: 'system';
  content: string;
  [key: string]: unknown;
}

export interface OpenAICompatibleUserMessage {
  role: 'user';
  content: string | Array<OpenAICompatibleContentPart>;
  [key: string]: unknown;
}

export type OpenAICompatibleContentPart =
  | OpenAICompatibleContentPartText
  | OpenAICompatibleContentPartImage;

export interface OpenAICompatibleContentPartImage {
  type: 'image_url';
  image_url: { url: string };
  [key: string]: unknown;
}

export interface OpenAICompatibleContentPartText {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

export interface OpenAICompatibleAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<OpenAICompatibleMessageToolCall>;
  [key: string]: unknown;
}

export interface OpenAICompatibleMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
    strict?: boolean;
  };
  [key: string]: unknown;
}

export interface OpenAICompatibleToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
  [key: string]: unknown;
}
