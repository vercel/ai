import { JSONSchema7 } from '@ai-sdk/provider';

export type AnthropicMessagesPrompt = {
  system: Array<AnthropicTextContent> | undefined;
  messages: AnthropicMessage[];
};

export type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export type AnthropicCacheControl = { type: 'ephemeral' };

export interface AnthropicUserMessage {
  role: 'user';
  content: Array<
    | AnthropicTextContent
    | AnthropicImageContent
    | AnthropicDocumentContent
    | AnthropicToolResultContent
  >;
}

export interface AnthropicAssistantMessage {
  role: 'assistant';
  content: Array<
    | AnthropicTextContent
    | AnthropicThinkingContent
    | AnthropicRedactedThinkingContent
    | AnthropicToolCallContent
  >;
}

export interface AnthropicTextContent {
  type: 'text';
  text: string;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicThinkingContent {
  type: 'thinking';
  thinking: string;
  signature: string;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicRedactedThinkingContent {
  type: 'redacted_thinking';
  data: string;
  cache_control: AnthropicCacheControl | undefined;
}

type AnthropicContentSource =
  | {
      type: 'base64';
      media_type: string;
      data: string;
    }
  | {
      type: 'url';
      url: string;
    };

export interface AnthropicImageContent {
  type: 'image';
  source: AnthropicContentSource;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicDocumentContent {
  type: 'document';
  source: AnthropicContentSource;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicToolCallContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<AnthropicTextContent | AnthropicImageContent>;
  is_error: boolean | undefined;
  cache_control: AnthropicCacheControl | undefined;
}

export type AnthropicTool =
  | {
      name: string;
      description: string | undefined;
      input_schema: JSONSchema7;
    }
  | {
      name: string;
      type: 'computer_20250124' | 'computer_20241022';
      display_width_px: number;
      display_height_px: number;
      display_number: number;
    }
  | {
      name: string;
      type: 'text_editor_20250124' | 'text_editor_20241022';
    }
  | {
      name: string;
      type: 'bash_20250124' | 'bash_20241022';
    };

export type AnthropicToolChoice =
  | { type: 'auto' | 'any' }
  | { type: 'tool'; name: string };
