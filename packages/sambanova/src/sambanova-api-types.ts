export type SambaNovaChatPrompt = Array<SambaNovaMessage>;

export type SambaNovaMessage =
  | SambaNovaSystemMessage
  | SambaNovaUserMessage
  | SambaNovaAssistantMessage
  | SambaNovaToolMessage;

export interface SambaNovaSystemMessage {
  role: 'system';
  content: string;
}

export interface SambaNovaUserMessage {
  role: 'user';
  content: string | Array<SambaNovaContentPart>;
}

export type SambaNovaContentPart =
  | SambaNovaContentPartText
  | SambaNovaContentPartImage;

export interface SambaNovaContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export interface SambaNovaContentPartText {
  type: 'text';
  text: string;
}

export interface SambaNovaAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<SambaNovaMessageToolCall>;
}

export interface SambaNovaMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface SambaNovaToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
