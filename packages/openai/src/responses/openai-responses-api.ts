import { JSONSchema7 } from '@ai-sdk/provider';
import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenAIResponsesInput = Array<OpenAIResponsesInputItem>;

export type OpenAIResponsesInputItem =
  | OpenAIResponsesSystemMessage
  | OpenAIResponsesUserMessage
  | OpenAIResponsesAssistantMessage
  | OpenAIResponsesFunctionCall
  | OpenAIResponsesFunctionCallOutput
  | OpenAIResponsesComputerCall
  | OpenAIResponsesLocalShellCall
  | OpenAIResponsesLocalShellCallOutput
  | OpenAIResponsesReasoning
  | OpenAIResponsesItemReference;

export type OpenAIResponsesIncludeValue =
  | 'web_search_call.action.sources'
  | 'code_interpreter_call.outputs'
  | 'computer_call_output.output.image_url'
  | 'file_search_call.results'
  | 'message.input_image.image_url'
  | 'message.output_text.logprobs'
  | 'reasoning.encrypted_content';

export type OpenAIResponsesIncludeOptions =
  | Array<OpenAIResponsesIncludeValue>
  | undefined
  | null;

export type OpenAIResponsesSystemMessage = {
  role: 'system' | 'developer';
  content: string;
};

export type OpenAIResponsesUserMessage = {
  role: 'user';
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string }
    | { type: 'input_image'; file_id: string }
    | { type: 'input_file'; file_url: string }
    | { type: 'input_file'; filename: string; file_data: string }
    | { type: 'input_file'; file_id: string }
  >;
};

export type OpenAIResponsesAssistantMessage = {
  role: 'assistant';
  content: Array<{ type: 'output_text'; text: string }>;
  id?: string;
};

export type OpenAIResponsesFunctionCall = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
  id?: string;
};

export type OpenAIResponsesFunctionCallOutput = {
  type: 'function_call_output';
  call_id: string;
  output:
    | string
    | Array<
        | { type: 'input_text'; text: string }
        | { type: 'input_image'; image_url: string }
        | { type: 'input_file'; filename: string; file_data: string }
      >;
};

export type OpenAIResponsesComputerCall = {
  type: 'computer_call';
  id: string;
  status?: string;
};

export type OpenAIResponsesLocalShellCall = {
  type: 'local_shell_call';
  id: string;
  call_id: string;
  action: {
    type: 'exec';
    command: string[];
    timeout_ms?: number;
    user?: string;
    working_directory?: string;
    env?: Record<string, string>;
  };
};

export type OpenAIResponsesLocalShellCallOutput = {
  type: 'local_shell_call_output';
  call_id: string;
  output: string;
};

export type OpenAIResponsesItemReference = {
  type: 'item_reference';
  id: string;
};

/**
 * A filter used to compare a specified attribute key to a given value using a defined comparison operation.
 */
export type OpenAIResponsesFileSearchToolComparisonFilter = {
  /**
   * The key to compare against the value.
   */
  key: string;

  /**
   * Specifies the comparison operator: eq, ne, gt, gte, lt, lte.
   */
  type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

  /**
   * The value to compare against the attribute key; supports string, number, or boolean types.
   */
  value: string | number | boolean;
};

/**
 * Combine multiple filters using and or or.
 */
export type OpenAIResponsesFileSearchToolCompoundFilter = {
  /**
   * Type of operation: and or or.
   */
  type: 'and' | 'or';

  /**
   * Array of filters to combine. Items can be ComparisonFilter or CompoundFilter.
   */
  filters: Array<
    | OpenAIResponsesFileSearchToolComparisonFilter
    | OpenAIResponsesFileSearchToolCompoundFilter
  >;
};

export type OpenAIResponsesTool =
  | {
      type: 'function';
      name: string;
      description: string | undefined;
      parameters: JSONSchema7;
      strict: boolean | undefined;
    }
  | {
      type: 'web_search';
      filters: { allowed_domains: string[] | undefined } | undefined;
      search_context_size: 'low' | 'medium' | 'high' | undefined;
      user_location:
        | {
            type: 'approximate';
            city?: string;
            country?: string;
            region?: string;
            timezone?: string;
          }
        | undefined;
    }
  | {
      type: 'web_search_preview';
      search_context_size: 'low' | 'medium' | 'high' | undefined;
      user_location:
        | {
            type: 'approximate';
            city?: string;
            country?: string;
            region?: string;
            timezone?: string;
          }
        | undefined;
    }
  | {
      type: 'code_interpreter';
      container: string | { type: 'auto'; file_ids: string[] | undefined };
    }
  | {
      type: 'file_search';
      vector_store_ids: string[];
      max_num_results: number | undefined;
      ranking_options:
        | { ranker?: string; score_threshold?: number }
        | undefined;
      filters:
        | OpenAIResponsesFileSearchToolComparisonFilter
        | OpenAIResponsesFileSearchToolCompoundFilter
        | undefined;
    }
  | {
      type: 'image_generation';
      background: 'auto' | 'opaque' | 'transparent' | undefined;
      input_fidelity: 'low' | 'high' | undefined;
      input_image_mask:
        | {
            file_id: string | undefined;
            image_url: string | undefined;
          }
        | undefined;
      model: string | undefined;
      moderation: 'auto' | undefined;
      output_compression: number | undefined;
      output_format: 'png' | 'jpeg' | 'webp' | undefined;
      partial_images: number | undefined;
      quality: 'auto' | 'low' | 'medium' | 'high' | undefined;
      size: 'auto' | '1024x1024' | '1024x1536' | '1536x1024' | undefined;
    }
  | {
      type: 'local_shell';
    };

export type OpenAIResponsesReasoning = {
  type: 'reasoning';
  id: string;
  encrypted_content?: string | null;
  summary: Array<{
    type: 'summary_text';
    text: string;
  }>;
};

const openaiResponsesAnnotationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url_citation'),
    url: z.string(),
    title: z.string(),
    start_index: z.number(),
    end_index: z.number(),
  }),
  z.object({
    type: z.literal('file_citation'),
    file_id: z.string(),
    filename: z.string(),
    index: z.number(),
    quote: z.string().nullish(),
  }),
  z.object({
    type: z.literal('container_file_citation'),
    container_id: z.string(),
    file_id: z.string(),
    filename: z.string(),
    start_index: z.number(),
    end_index: z.number(),
  }),
]);
export type OpenaiResponsesAnnotationSchema = z.infer<
  typeof openaiResponsesAnnotationSchema
>;

export const openaiResponsesChunkSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        type: z.literal('response.output_text.delta'),
        item_id: z.string(),
        delta: z.string(),
        logprobs: z
          .array(
            z.object({
              token: z.string(),
              logprob: z.number(),
              top_logprobs: z.array(
                z.object({
                  token: z.string(),
                  logprob: z.number(),
                }),
              ),
            }),
          )
          .nullish(),
      }),
      z.object({
        type: z.enum(['response.completed', 'response.incomplete']),
        response: z.object({
          incomplete_details: z.object({ reason: z.string() }).nullish(),
          usage: z.object({
            input_tokens: z.number(),
            input_tokens_details: z
              .object({ cached_tokens: z.number().nullish() })
              .nullish(),
            output_tokens: z.number(),
            output_tokens_details: z
              .object({ reasoning_tokens: z.number().nullish() })
              .nullish(),
          }),
          service_tier: z.string().nullish(),
        }),
      }),
      z.object({
        type: z.literal('response.created'),
        response: z.object({
          id: z.string(),
          created_at: z.number(),
          model: z.string(),
          service_tier: z.string().nullish(),
        }),
      }),
      z.object({
        type: z.literal('response.output_item.added'),
        output_index: z.number(),
        item: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('message'),
            id: z.string(),
          }),
          z.object({
            type: z.literal('reasoning'),
            id: z.string(),
            encrypted_content: z.string().nullish(),
          }),
          z.object({
            type: z.literal('function_call'),
            id: z.string(),
            call_id: z.string(),
            name: z.string(),
            arguments: z.string(),
          }),
          z.object({
            type: z.literal('web_search_call'),
            id: z.string(),
            status: z.string(),
          }),
          z.object({
            type: z.literal('computer_call'),
            id: z.string(),
            status: z.string(),
          }),
          z.object({
            type: z.literal('file_search_call'),
            id: z.string(),
          }),
          z.object({
            type: z.literal('image_generation_call'),
            id: z.string(),
          }),
          z.object({
            type: z.literal('code_interpreter_call'),
            id: z.string(),
            container_id: z.string(),
            code: z.string().nullable(),
            outputs: z
              .array(
                z.discriminatedUnion('type', [
                  z.object({ type: z.literal('logs'), logs: z.string() }),
                  z.object({ type: z.literal('image'), url: z.string() }),
                ]),
              )
              .nullable(),
            status: z.string(),
          }),
        ]),
      }),
      z.object({
        type: z.literal('response.output_item.done'),
        output_index: z.number(),
        item: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('message'),
            id: z.string(),
          }),
          z.object({
            type: z.literal('reasoning'),
            id: z.string(),
            encrypted_content: z.string().nullish(),
          }),
          z.object({
            type: z.literal('function_call'),
            id: z.string(),
            call_id: z.string(),
            name: z.string(),
            arguments: z.string(),
            status: z.literal('completed'),
          }),
          z.object({
            type: z.literal('code_interpreter_call'),
            id: z.string(),
            code: z.string().nullable(),
            container_id: z.string(),
            outputs: z
              .array(
                z.discriminatedUnion('type', [
                  z.object({ type: z.literal('logs'), logs: z.string() }),
                  z.object({ type: z.literal('image'), url: z.string() }),
                ]),
              )
              .nullable(),
          }),
          z.object({
            type: z.literal('image_generation_call'),
            id: z.string(),
            result: z.string(),
          }),
          z.object({
            type: z.literal('web_search_call'),
            id: z.string(),
            status: z.string(),
            action: z.discriminatedUnion('type', [
              z.object({
                type: z.literal('search'),
                query: z.string().nullish(),
              }),
              z.object({
                type: z.literal('open_page'),
                url: z.string(),
              }),
              z.object({
                type: z.literal('find'),
                url: z.string(),
                pattern: z.string(),
              }),
            ]),
          }),
          z.object({
            type: z.literal('file_search_call'),
            id: z.string(),
            queries: z.array(z.string()),
            results: z
              .array(
                z.object({
                  attributes: z.record(z.string(), z.unknown()),
                  file_id: z.string(),
                  filename: z.string(),
                  score: z.number(),
                  text: z.string(),
                }),
              )
              .nullish(),
          }),
          z.object({
            type: z.literal('local_shell_call'),
            id: z.string(),
            call_id: z.string(),
            action: z.object({
              type: z.literal('exec'),
              command: z.array(z.string()),
              timeout_ms: z.number().optional(),
              user: z.string().optional(),
              working_directory: z.string().optional(),
              env: z.record(z.string(), z.string()).optional(),
            }),
          }),
          z.object({
            type: z.literal('computer_call'),
            id: z.string(),
            status: z.literal('completed'),
          }),
        ]),
      }),
      z.object({
        type: z.literal('response.function_call_arguments.delta'),
        item_id: z.string(),
        output_index: z.number(),
        delta: z.string(),
      }),
      z.object({
        type: z.literal('response.image_generation_call.partial_image'),
        item_id: z.string(),
        output_index: z.number(),
        partial_image_b64: z.string(),
      }),
      z.object({
        type: z.literal('response.code_interpreter_call_code.delta'),
        item_id: z.string(),
        output_index: z.number(),
        delta: z.string(),
      }),
      z.object({
        type: z.literal('response.code_interpreter_call_code.done'),
        item_id: z.string(),
        output_index: z.number(),
        code: z.string(),
      }),
      z.object({
        type: z.literal('response.output_text.annotation.added'),
        annotation: openaiResponsesAnnotationSchema,
      }),
      z.object({
        type: z.literal('response.reasoning_summary_part.added'),
        item_id: z.string(),
        summary_index: z.number(),
      }),
      z.object({
        type: z.literal('response.reasoning_summary_text.delta'),
        item_id: z.string(),
        summary_index: z.number(),
        delta: z.string(),
      }),
      z.object({
        type: z.literal('response.reasoning_summary_part.done'),
        item_id: z.string(),
        summary_index: z.number(),
      }),
      z.object({
        type: z.literal('error'),
        code: z.string(),
        message: z.string(),
        param: z.string().nullish(),
        sequence_number: z.number(),
      }),
      z
        .object({ type: z.string() })
        .loose()
        .transform(value => ({
          type: 'unknown_chunk' as const,
          message: value.type,
        })), // fallback for unknown chunks
    ]),
  ),
);

export type OpenAIResponsesChunk = InferSchema<
  typeof openaiResponsesChunkSchema
>;

export type OpenAIResponsesLogprobs = NonNullable<
  (OpenAIResponsesChunk & {
    type: 'response.output_text.delta';
  })['logprobs']
> | null;

export type OpenAIResponsesWebSearchAction = NonNullable<
  ((OpenAIResponsesChunk & {
    type: 'response.output_item.done';
  })['item'] & {
    type: 'web_search_call';
  })['action']
>;

export const openaiResponsesResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      created_at: z.number(),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
        })
        .nullish(),
      model: z.string(),
      output: z.array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('message'),
            role: z.literal('assistant'),
            id: z.string(),
            content: z.array(
              z.object({
                type: z.literal('output_text'),
                text: z.string(),
                logprobs: z
                  .array(
                    z.object({
                      token: z.string(),
                      logprob: z.number(),
                      top_logprobs: z.array(
                        z.object({
                          token: z.string(),
                          logprob: z.number(),
                        }),
                      ),
                    }),
                  )
                  .nullish(),
                annotations: z.array(
                  z.discriminatedUnion('type', [
                    z.object({
                      type: z.literal('url_citation'),
                      start_index: z.number(),
                      end_index: z.number(),
                      url: z.string(),
                      title: z.string(),
                    }),
                    z.object({
                      type: z.literal('file_citation'),
                      file_id: z.string(),
                      filename: z.string().nullish(),
                      index: z.number().nullish(),
                      start_index: z.number().nullish(),
                      end_index: z.number().nullish(),
                      quote: z.string().nullish(),
                    }),
                    z.object({
                      type: z.literal('container_file_citation'),
                      container_id: z.string(),
                      file_id: z.string(),
                      filename: z.string(),
                      start_index: z.number(),
                      end_index: z.number(),
                    }),
                  ]),
                ),
              }),
            ),
          }),
          z.object({
            type: z.literal('web_search_call'),
            id: z.string(),
            status: z.string(),
            action: z.discriminatedUnion('type', [
              z.object({
                type: z.literal('search'),
                query: z.string().nullish(),
              }),
              z.object({
                type: z.literal('open_page'),
                url: z.string(),
              }),
              z.object({
                type: z.literal('find'),
                url: z.string(),
                pattern: z.string(),
              }),
            ]),
          }),
          z.object({
            type: z.literal('file_search_call'),
            id: z.string(),
            queries: z.array(z.string()),
            results: z
              .array(
                z.object({
                  attributes: z.record(z.string(), z.unknown()),
                  file_id: z.string(),
                  filename: z.string(),
                  score: z.number(),
                  text: z.string(),
                }),
              )
              .nullish(),
          }),
          z.object({
            type: z.literal('code_interpreter_call'),
            id: z.string(),
            code: z.string().nullable(),
            container_id: z.string(),
            outputs: z
              .array(
                z.discriminatedUnion('type', [
                  z.object({ type: z.literal('logs'), logs: z.string() }),
                  z.object({ type: z.literal('image'), url: z.string() }),
                ]),
              )
              .nullable(),
          }),
          z.object({
            type: z.literal('image_generation_call'),
            id: z.string(),
            result: z.string(),
          }),
          z.object({
            type: z.literal('local_shell_call'),
            id: z.string(),
            call_id: z.string(),
            action: z.object({
              type: z.literal('exec'),
              command: z.array(z.string()),
              timeout_ms: z.number().optional(),
              user: z.string().optional(),
              working_directory: z.string().optional(),
              env: z.record(z.string(), z.string()).optional(),
            }),
          }),
          z.object({
            type: z.literal('function_call'),
            call_id: z.string(),
            name: z.string(),
            arguments: z.string(),
            id: z.string(),
          }),
          z.object({
            type: z.literal('computer_call'),
            id: z.string(),
            status: z.string().optional(),
          }),
          z.object({
            type: z.literal('reasoning'),
            id: z.string(),
            encrypted_content: z.string().nullish(),
            summary: z.array(
              z.object({
                type: z.literal('summary_text'),
                text: z.string(),
              }),
            ),
          }),
        ]),
      ),
      service_tier: z.string().nullish(),
      incomplete_details: z.object({ reason: z.string() }).nullish(),
      usage: z.object({
        input_tokens: z.number(),
        input_tokens_details: z
          .object({ cached_tokens: z.number().nullish() })
          .nullish(),
        output_tokens: z.number(),
        output_tokens_details: z
          .object({ reasoning_tokens: z.number().nullish() })
          .nullish(),
      }),
    }),
  ),
);

export const openaiResponsesTextUIPartProviderMetadataSchema = z.object({
  openai: z.object({
    itemId: z.string(),
    annotations: z.array(openaiResponsesAnnotationSchema),
  }),
});

export const openaiSourceExecutionFileProviderMetadataSchema = z.object({
  openai: z.object({
    containerId: z.string(),
    fileId: z.string(),
    filename: z.string(),
  }),
});
