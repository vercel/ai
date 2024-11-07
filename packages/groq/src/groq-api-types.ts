export type GroqChatPrompt = Array<GroqMessage>;

export type GroqMessage =
  | GroqSystemMessage
  | GroqUserMessage
  | GroqAssistantMessage
  | GroqToolMessage;

export interface GroqSystemMessage {
  role: 'system';
  content: string;
}

export interface GroqUserMessage {
  role: 'user';
  content: string | Array<GroqContentPart>;
}

export type GroqContentPart = GroqContentPartText | GroqContentPartImage;

export interface GroqContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export interface GroqContentPartText {
  type: 'text';
  text: string;
}

export interface GroqAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<GroqMessageToolCall>;
}

export interface GroqMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface GroqToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
