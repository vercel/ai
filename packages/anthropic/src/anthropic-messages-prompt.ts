export type AnthropicMessagesPrompt = {
  system: Array<AnthropicTextContent> | undefined;
  messages: AnthropicMessage[];
};

export type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export type AnthropicCacheControl = { type: 'ephemeral' };

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

export interface AnthropicTextContent {
  type: 'text';
  text: string;
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicToolCallContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error: boolean | undefined;
  cache_control?: AnthropicCacheControl;
}
