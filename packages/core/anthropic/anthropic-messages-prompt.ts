export type AnthropicMessagesPrompt = {
  system?: string;
  messages: AnthropicMessage[];
};

export type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export interface AnthropicUserMessage {
  role: 'user';
  content: Array<AnthropicUserContent>;
}

export type AnthropicUserContent =
  | AnthropicUserTextContent
  | AnthropicUserImageContent;

export interface AnthropicUserTextContent {
  type: 'text';
  text: string;
}

export interface AnthropicUserImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface AnthropicAssistantMessage {
  role: 'assistant';
  content: string;
}
