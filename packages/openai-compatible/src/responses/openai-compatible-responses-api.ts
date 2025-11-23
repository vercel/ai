import { JSONSchema7 } from '@ai-sdk/provider';
import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import z from 'zod/v4';

export type OpenAICompatibleResponsesInput =
  Array<OpenAICompatibleResponsesInputItem>;

export type OpenAICompatibleResponsesInputItem =
  | OpenAICompatibleResponsesSystemMessage
  | OpenAICompatibleResponsesUserMessage
  | OpenAICompatibleResponsesAssistantMessage
  | OpenAICompatibleResponsesFunctionCall
  | OpenAICompatibleResponsesFunctionCallOutput
  | OpenAICompatibleResponsesReasoning;

export type OpenAICompatibleResponsesReasoning = {
  type: 'reasoning';
  id: string;
  encrypted_content?: string | null;
  summary: Array<{
    type: 'summary_text';
    text: string;
  }>;
};

export const openaiCompatibleResponsesResponseSchema = lazySchema(() =>
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
              }),
            ),
          }),
          z.object({
            type: z.literal('function_call'),
            call_id: z.string(),
            name: z.string(),
            arguments: z.string(),
            id: z.string(),
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

export const openaiCompatibleResponsesChunkSchema = lazySchema(() =>
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
        annotation: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('url_citation'),
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
        ]),
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
      openaiCompatibleResponsesErrorDataSchema,
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

export const openaiCompatibleResponsesErrorDataSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  code: z.union([z.string(), z.number()]).nullish(),
  param: z.any().nullish(),
  sequence_number: z.number().nullish(),
});

export type OpenAICompatibleResponsesErrorData = z.infer<
  typeof openaiCompatibleResponsesErrorDataSchema
>;

export type OpenAICompatibleResponsesChunk = InferSchema<
  typeof openaiCompatibleResponsesChunkSchema
>;

export type OpenAICompatibleResponsesLogprobs = NonNullable<
  (OpenAICompatibleResponsesChunk & {
    type: 'response.output_text.delta';
  })['logprobs']
> | null;

export type OpenAICompatibleResponsesIncludeValue = string;

export type OpenAICompatibleResponsesIncludeOptions =
  | Array<OpenAICompatibleResponsesIncludeValue>
  | undefined
  | null;

export type OpenAICompatibleResponsesSystemMessage = {
  role: 'system' | 'developer';
  content: string;
};

export type OpenAICompatibleResponsesUserMessage = {
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

export type OpenAICompatibleResponsesAssistantMessage = {
  role: 'assistant';
  content: Array<{ type: 'output_text'; text: string }>;
  id?: string;
};

export type OpenAICompatibleResponsesFunctionCall = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
  id?: string;
};

export type OpenAICompatibleResponsesFunctionCallOutput = {
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

export type OpenAICompatibleResponsesTool = {
  type: 'function';
  name: string;
  description: string | undefined;
  parameters: JSONSchema7;
  strict: boolean | undefined;
};
