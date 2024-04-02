export type AnthropicMessagesPrompt = {
  system?: string;
  messages: AnthropicMessage[];
};

export type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export interface AnthropicUserMessage {
  role: 'user';
  content: string;
}

export interface AnthropicAssistantMessage {
  role: 'assistant';
  content: string;
}
