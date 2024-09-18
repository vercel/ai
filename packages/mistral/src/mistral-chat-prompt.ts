export type MistralChatPrompt = Array<MistralChatMessage>;

export type MistralChatMessage =
  | MistralSystemMessage
  | MistralUserMessage
  | MistralAssistantMessage
  | MistralToolMessage;

export interface MistralSystemMessage {
  role: 'system';
  content: string;
}

export interface MistralUserMessage {
  role: 'user';
  content: Array<MistralUserMessageContent>;
}

export type MistralUserMessageContent =
  | MistralUserMessageTextContent
  | MistralUserMessageImageContent;

export interface MistralUserMessageImageContent {
  type: 'image_url';
  image_url: string;
}

export interface MistralUserMessageTextContent {
  type: 'text';
  text: string;
}

export interface MistralAssistantMessage {
  role: 'assistant';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface MistralToolMessage {
  role: 'tool';
  name: string;
  content: string;
  tool_call_id: string;
}
