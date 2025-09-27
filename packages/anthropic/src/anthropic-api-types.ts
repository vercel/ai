import { JSONSchema7 } from '@ai-sdk/provider';

export type AnthropicMessagesPrompt = {
  system: Array<AnthropicTextContent> | undefined;
  messages: AnthropicMessage[];
};

export type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

export type AnthropicCacheControl = {
  type: 'ephemeral';
};

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
    | AnthropicServerToolUseContent
    | AnthropicCodeExecutionToolResultContent
    | AnthropicWebFetchToolResultContent
    | AnthropicWebSearchToolResultContent
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
    }
  | {
      type: 'text';
      media_type: 'text/plain';
      data: string;
    };

export interface AnthropicImageContent {
  type: 'image';
  source: AnthropicContentSource;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicDocumentContent {
  type: 'document';
  source: AnthropicContentSource;
  title?: string;
  context?: string;
  citations?: { enabled: boolean };
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicToolCallContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicServerToolUseContent {
  type: 'server_tool_use';
  id: string;
  name: 'code_execution' | 'web_fetch' | 'web_search';
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

export interface AnthropicWebSearchToolResultContent {
  type: 'web_search_tool_result';
  tool_use_id: string;
  content: Array<{
    url: string;
    title: string;
    page_age: string | null;
    encrypted_content: string;
    type: string;
  }>;
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicCodeExecutionToolResultContent {
  type: 'code_execution_tool_result';
  tool_use_id: string;
  content: {
    type: 'code_execution_result';
    stdout: string;
    stderr: string;
    return_code: number;
  };
  cache_control: AnthropicCacheControl | undefined;
}

export interface AnthropicWebFetchToolResultContent {
  type: 'web_fetch_tool_result';
  tool_use_id: string;
  content: {
    type: 'web_fetch_result';
    url: string;
    retrieved_at: string | null;
    content: {
      type: 'document';
      title: string | null;
      citations?: { enabled: boolean };
      source:
        | { type: 'base64'; media_type: 'application/pdf'; data: string }
        | { type: 'text'; media_type: 'text/plain'; data: string };
    };
  };
  cache_control: AnthropicCacheControl | undefined;
}

export type AnthropicTool =
  | {
      name: string;
      description: string | undefined;
      input_schema: JSONSchema7;
      cache_control: AnthropicCacheControl | undefined;
    }
  | {
      type: 'code_execution_20250522';
      name: string;
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
      type:
        | 'text_editor_20250124'
        | 'text_editor_20241022'
        | 'text_editor_20250429';
    }
  | {
      name: string;
      type: 'text_editor_20250728';
      max_characters?: number;
    }
  | {
      name: string;
      type: 'bash_20250124' | 'bash_20241022';
    }
  | {
      type: 'web_fetch_20250910';
      name: string;
      max_uses?: number;
      allowed_domains?: string[];
      blocked_domains?: string[];
      citations?: { enabled: boolean };
      max_content_tokens?: number;
    }
  | {
      type: 'web_search_20250305';
      name: string;
      max_uses?: number;
      allowed_domains?: string[];
      blocked_domains?: string[];
      user_location?: {
        type: 'approximate';
        city?: string;
        region?: string;
        country?: string;
        timezone?: string;
      };
    };

export type AnthropicToolChoice =
  | { type: 'auto' | 'any'; disable_parallel_tool_use?: boolean }
  | { type: 'tool'; name: string; disable_parallel_tool_use?: boolean };
