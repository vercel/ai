export type OpenAICompatibleChatPrompt = Array<OpenAICompatibleMessage>;

export type OpenAICompatibleMessage =
  | OpenAICompatibleSystemMessage
  | OpenAICompatibleUserMessage
  | OpenAICompatibleAssistantMessage
  | OpenAICompatibleToolMessage;

export interface OpenAICompatibleSystemMessage {
  role: 'system';
  content: string;
}

export interface OpenAICompatibleUserMessage {
  role: 'user';
  content: string | Array<OpenAICompatibleContentPart>;
}

export type OpenAICompatibleContentPart =
  | OpenAICompatibleContentPartText
  | OpenAICompatibleContentPartImage;

export interface OpenAICompatibleContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export interface OpenAICompatibleContentPartText {
  type: 'text';
  text: string;
}

export interface OpenAICompatibleAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<OpenAICompatibleMessageToolCall>;
}

export interface OpenAICompatibleMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
    strict?: boolean;
  };
}

export interface OpenAICompatibleToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
