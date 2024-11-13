export type GrokChatPrompt = Array<GrokMessage>;

export type GrokMessage =
  | GrokSystemMessage
  | GrokUserMessage
  | GrokAssistantMessage
  | GrokToolMessage;

export interface GrokSystemMessage {
  role: 'system';
  content: string;
}

export interface GrokUserMessage {
  role: 'user';
  content: string | Array<GrokContentPart>;
}

export type GrokContentPart = GrokContentPartText | GrokContentPartImage;

export interface GrokContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export interface GrokContentPartText {
  type: 'text';
  text: string;
}

export interface GrokAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<GrokMessageToolCall>;
}

export interface GrokMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface GrokToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
