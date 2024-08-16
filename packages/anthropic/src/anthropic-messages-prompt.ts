export type AnthropicMessagesPrompt = {
  system?: AnthropicSystemMessage[];
  messages: AnthropicMessage[];
};

export type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export interface AnthropicUserMessage {
  role: 'user';
  content: Array<
    AnthropicTextContent | AnthropicImageContent | AnthropicToolResultContent
  >;
}

export interface AnthropicAssistantMessage {
  role: 'assistant';
  content: Array<AnthropicTextContent | AnthropicToolCallContent>;
}

export type AnthropicSystemMessage = AnthropicTextContent;

export interface AnthropicTextContent {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicToolCallContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}
