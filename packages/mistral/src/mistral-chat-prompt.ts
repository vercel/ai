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
  content: string;
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
}
