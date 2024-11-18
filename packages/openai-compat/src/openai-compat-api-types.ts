export type OpenAICompatChatPrompt = Array<OpenAICompatMessage>;

export type OpenAICompatMessage =
  | OpenAICompatSystemMessage
  | OpenAICompatUserMessage
  | OpenAICompatAssistantMessage
  | OpenAICompatToolMessage;

export interface OpenAICompatSystemMessage {
  role: 'system';
  content: string;
}

export interface OpenAICompatUserMessage {
  role: 'user';
  content: string | Array<OpenAICompatContentPart>;
}

export type OpenAICompatContentPart =
  | OpenAICompatContentPartText
  | OpenAICompatContentPartImage;

export interface OpenAICompatContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export interface OpenAICompatContentPartText {
  type: 'text';
  text: string;
}

export interface OpenAICompatAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<OpenAICompatMessageToolCall>;
}

export interface OpenAICompatMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface OpenAICompatToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
