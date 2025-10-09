import { JSONSchema7 } from '@ai-sdk/provider';
import { InferValidator, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

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

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const anthropicMessagesResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.literal('message'),
      id: z.string().nullish(),
      model: z.string().nullish(),
      content: z.array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('text'),
            text: z.string(),
            citations: z
              .array(
                z.discriminatedUnion('type', [
                  z.object({
                    type: z.literal('web_search_result_location'),
                    cited_text: z.string(),
                    url: z.string(),
                    title: z.string(),
                    encrypted_index: z.string(),
                  }),
                  z.object({
                    type: z.literal('page_location'),
                    cited_text: z.string(),
                    document_index: z.number(),
                    document_title: z.string().nullable(),
                    start_page_number: z.number(),
                    end_page_number: z.number(),
                  }),
                  z.object({
                    type: z.literal('char_location'),
                    cited_text: z.string(),
                    document_index: z.number(),
                    document_title: z.string().nullable(),
                    start_char_index: z.number(),
                    end_char_index: z.number(),
                  }),
                ]),
              )
              .optional(),
          }),
          z.object({
            type: z.literal('thinking'),
            thinking: z.string(),
            signature: z.string(),
          }),
          z.object({
            type: z.literal('redacted_thinking'),
            data: z.string(),
          }),
          z.object({
            type: z.literal('tool_use'),
            id: z.string(),
            name: z.string(),
            input: z.unknown(),
          }),
          z.object({
            type: z.literal('server_tool_use'),
            id: z.string(),
            name: z.string(),
            input: z.record(z.string(), z.unknown()).nullish(),
          }),
          z.object({
            type: z.literal('web_fetch_tool_result'),
            tool_use_id: z.string(),
            content: z.union([
              z.object({
                type: z.literal('web_fetch_result'),
                url: z.string(),
                retrieved_at: z.string(),
                content: z.object({
                  type: z.literal('document'),
                  title: z.string().nullable(),
                  citations: z.object({ enabled: z.boolean() }).optional(),
                  source: z.object({
                    type: z.literal('text'),
                    media_type: z.string(),
                    data: z.string(),
                  }),
                }),
              }),
              z.object({
                type: z.literal('web_fetch_tool_result_error'),
                error_code: z.string(),
              }),
            ]),
          }),
          z.object({
            type: z.literal('web_search_tool_result'),
            tool_use_id: z.string(),
            content: z.union([
              z.array(
                z.object({
                  type: z.literal('web_search_result'),
                  url: z.string(),
                  title: z.string(),
                  encrypted_content: z.string(),
                  page_age: z.string().nullish(),
                }),
              ),
              z.object({
                type: z.literal('web_search_tool_result_error'),
                error_code: z.string(),
              }),
            ]),
          }),
          z.object({
            type: z.literal('code_execution_tool_result'),
            tool_use_id: z.string(),
            content: z.union([
              z.object({
                type: z.literal('code_execution_result'),
                stdout: z.string(),
                stderr: z.string(),
                return_code: z.number(),
              }),
              z.object({
                type: z.literal('code_execution_tool_result_error'),
                error_code: z.string(),
              }),
            ]),
          }),
        ]),
      ),
      stop_reason: z.string().nullish(),
      stop_sequence: z.string().nullish(),
      usage: z.looseObject({
        input_tokens: z.number(),
        output_tokens: z.number(),
        cache_creation_input_tokens: z.number().nullish(),
        cache_read_input_tokens: z.number().nullish(),
      }),
    }),
  ),
);

// limited version of the schema, focused on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const anthropicMessagesChunkSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('message_start'),
        message: z.object({
          id: z.string().nullish(),
          model: z.string().nullish(),
          usage: z.looseObject({
            input_tokens: z.number(),
            cache_creation_input_tokens: z.number().nullish(),
            cache_read_input_tokens: z.number().nullish(),
          }),
        }),
      }),
      z.object({
        type: z.literal('content_block_start'),
        index: z.number(),
        content_block: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('text'),
            text: z.string(),
          }),
          z.object({
            type: z.literal('thinking'),
            thinking: z.string(),
          }),
          z.object({
            type: z.literal('tool_use'),
            id: z.string(),
            name: z.string(),
          }),
          z.object({
            type: z.literal('redacted_thinking'),
            data: z.string(),
          }),
          z.object({
            type: z.literal('server_tool_use'),
            id: z.string(),
            name: z.string(),
            input: z.record(z.string(), z.unknown()).nullish(),
          }),
          z.object({
            type: z.literal('web_fetch_tool_result'),
            tool_use_id: z.string(),
            content: z.union([
              z.object({
                type: z.literal('web_fetch_result'),
                url: z.string(),
                retrieved_at: z.string(),
                content: z.object({
                  type: z.literal('document'),
                  title: z.string().nullable(),
                  citations: z.object({ enabled: z.boolean() }).optional(),
                  source: z.object({
                    type: z.literal('text'),
                    media_type: z.string(),
                    data: z.string(),
                  }),
                }),
              }),
              z.object({
                type: z.literal('web_fetch_tool_result_error'),
                error_code: z.string(),
              }),
            ]),
          }),
          z.object({
            type: z.literal('web_search_tool_result'),
            tool_use_id: z.string(),
            content: z.union([
              z.array(
                z.object({
                  type: z.literal('web_search_result'),
                  url: z.string(),
                  title: z.string(),
                  encrypted_content: z.string(),
                  page_age: z.string().nullish(),
                }),
              ),
              z.object({
                type: z.literal('web_search_tool_result_error'),
                error_code: z.string(),
              }),
            ]),
          }),
          z.object({
            type: z.literal('code_execution_tool_result'),
            tool_use_id: z.string(),
            content: z.union([
              z.object({
                type: z.literal('code_execution_result'),
                stdout: z.string(),
                stderr: z.string(),
                return_code: z.number(),
              }),
              z.object({
                type: z.literal('code_execution_tool_result_error'),
                error_code: z.string(),
              }),
            ]),
          }),
        ]),
      }),
      z.object({
        type: z.literal('content_block_delta'),
        index: z.number(),
        delta: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('input_json_delta'),
            partial_json: z.string(),
          }),
          z.object({
            type: z.literal('text_delta'),
            text: z.string(),
          }),
          z.object({
            type: z.literal('thinking_delta'),
            thinking: z.string(),
          }),
          z.object({
            type: z.literal('signature_delta'),
            signature: z.string(),
          }),
          z.object({
            type: z.literal('citations_delta'),
            citation: z.discriminatedUnion('type', [
              z.object({
                type: z.literal('web_search_result_location'),
                cited_text: z.string(),
                url: z.string(),
                title: z.string(),
                encrypted_index: z.string(),
              }),
              z.object({
                type: z.literal('page_location'),
                cited_text: z.string(),
                document_index: z.number(),
                document_title: z.string().nullable(),
                start_page_number: z.number(),
                end_page_number: z.number(),
              }),
              z.object({
                type: z.literal('char_location'),
                cited_text: z.string(),
                document_index: z.number(),
                document_title: z.string().nullable(),
                start_char_index: z.number(),
                end_char_index: z.number(),
              }),
            ]),
          }),
        ]),
      }),
      z.object({
        type: z.literal('content_block_stop'),
        index: z.number(),
      }),
      z.object({
        type: z.literal('error'),
        error: z.object({
          type: z.string(),
          message: z.string(),
        }),
      }),
      z.object({
        type: z.literal('message_delta'),
        delta: z.object({
          stop_reason: z.string().nullish(),
          stop_sequence: z.string().nullish(),
        }),
        usage: z.looseObject({
          output_tokens: z.number(),
          cache_creation_input_tokens: z.number().nullish(),
        }),
      }),
      z.object({
        type: z.literal('message_stop'),
      }),
      z.object({
        type: z.literal('ping'),
      }),
    ]),
  ),
);

export const anthropicReasoningMetadataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      signature: z.string().optional(),
      redactedData: z.string().optional(),
    }),
  ),
);

export type AnthropicReasoningMetadata = InferValidator<
  typeof anthropicReasoningMetadataSchema
>;

export type Citation = NonNullable<
  (InferValidator<typeof anthropicMessagesResponseSchema>['content'][number] & {
    type: 'text';
  })['citations']
>[number];
