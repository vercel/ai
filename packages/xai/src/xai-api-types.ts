export type XaiChatPrompt = Array<XaiMessage>;

export type XaiMessage =
  | XaiSystemMessage
  | XaiUserMessage
  | XaiAssistantMessage
  | XaiToolMessage;

export interface XaiSystemMessage {
  role: 'system';
  content: string;
}

export interface XaiUserMessage {
  role: 'user';
  content: string | Array<XaiContentPart>;
}

export type XaiContentPart = XaiContentPartText | XaiContentPartImage;

export interface XaiContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export interface XaiContentPartText {
  type: 'text';
  text: string;
}

export interface XaiAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<XaiMessageToolCall>;
}

export interface XaiMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface XaiToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
