import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type DeepSeekResponsesInput = Array<DeepSeekResponsesInputItem>;

export type DeepSeekResponsesInputItem =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: Array<DeepSeekResponsesInputContentPart> }
  | {
      type: 'function_call';
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: 'function_call_output';
      call_id: string;
      output: string | Array<DeepSeekResponsesInputContentPart>;
    }
  | {
      type: 'reasoning';
      id?: string;
      content: Array<{ type: 'reasoning_text'; text: string }>;
    }
  | ({ type: 'web_search_call' } & Record<string, unknown>);

export type DeepSeekResponsesInputContentPart =
  | { type: 'input_text'; text: string }
  | {
      type: 'input_image';
      image_url?: string;
      file_id?: string;
      detail?: 'low' | 'high' | 'original' | 'auto';
    };

export type DeepSeekResponsesTool =
  | {
      type: 'function';
      name: string;
      description?: string;
      parameters: unknown;
    }
  | { type: 'web_search' };

export type DeepSeekResponsesToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; name: string };

export type DeepSeekResponsesUsage = z.infer<
  ReturnType<typeof createUsageSchema>
>;

export type DeepSeekResponsesOutputItem = z.infer<
  ReturnType<typeof createOutputItemSchema>
>;

export type DeepSeekResponsesChunk = z.infer<
  ReturnType<typeof createChunkSchema>
>;

export const deepseekResponsesResponseSchema = lazySchema(() =>
  zodSchema(createResponseSchema()),
);

export const deepseekResponsesChunkSchema = lazySchema(() =>
  zodSchema(createChunkSchema()),
);

function createUsageSchema() {
  return z.object({
    input_tokens: z.number().nullish(),
    input_tokens_details: z
      .object({ cached_tokens: z.number().nullish() })
      .nullish(),
    output_tokens: z.number().nullish(),
    output_tokens_details: z
      .object({ reasoning_tokens: z.number().nullish() })
      .nullish(),
    total_tokens: z.number().nullish(),
    server_tool_use: z
      .object({
        tool_search: z.number().nullish(),
        tool_fetch: z.number().nullish(),
      })
      .nullish(),
  });
}

function createLogprobSchema() {
  return z.object({
    token: z.string(),
    logprob: z.number(),
    bytes: z.array(z.number()).nullish(),
    top_logprobs: z
      .array(
        z.object({
          token: z.string(),
          logprob: z.number(),
          bytes: z.array(z.number()).nullish(),
        }),
      )
      .nullish(),
  });
}

function createOutputItemSchema() {
  return z.union([
    z.object({
      type: z.literal('message'),
      id: z.string().nullish(),
      content: z
        .array(
          z.object({
            type: z.string(),
            text: z.string().nullish(),
            logprobs: z.array(createLogprobSchema()).nullish(),
          }),
        )
        .nullish(),
    }),
    z.object({
      type: z.literal('reasoning'),
      id: z.string().nullish(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().nullish() }))
        .nullish(),
    }),
    z.object({
      type: z.literal('function_call'),
      id: z.string().nullish(),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string().nullish(),
    }),
    z.looseObject({
      type: z.literal('web_search_call'),
      id: z.string(),
      status: z.string().nullish(),
      action: z.record(z.string(), z.unknown()).nullish(),
    }),
    z.looseObject({ type: z.string() }),
  ]);
}

function createResponseObjectSchema() {
  return z.object({
    id: z.string().nullish(),
    created_at: z.number().nullish(),
    model: z.string().nullish(),
    status: z.string().nullish(),
    error: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
      })
      .nullish(),
    incomplete_details: z.object({ reason: z.string().nullish() }).nullish(),
    output: z.array(createOutputItemSchema()).nullish(),
    usage: createUsageSchema().nullish(),
  });
}

function createResponseSchema() {
  return createResponseObjectSchema();
}

function createChunkSchema() {
  const responseObject = createResponseObjectSchema();
  const outputItem = createOutputItemSchema();

  return z.union([
    z.object({
      type: z.enum(['response.created', 'response.in_progress']),
      response: responseObject,
    }),
    z.object({
      type: z.enum([
        'response.completed',
        'response.incomplete',
        'response.failed',
      ]),
      response: responseObject,
    }),
    z.object({
      type: z.enum(['response.output_item.added', 'response.output_item.done']),
      output_index: z.number().nullish(),
      item: outputItem,
    }),
    z.object({
      type: z.literal('response.output_text.delta'),
      item_id: z.string(),
      delta: z.string(),
      logprobs: z.array(createLogprobSchema()).nullish(),
    }),
    z.object({
      type: z.literal('response.reasoning_text.delta'),
      item_id: z.string(),
      delta: z.string(),
    }),
    z.object({
      type: z.literal('response.function_call_arguments.delta'),
      item_id: z.string(),
      delta: z.string(),
    }),
    z.object({
      type: z.literal('error'),
      code: z.string().nullish(),
      message: z.string().nullish(),
    }),
    z.looseObject({ type: z.string() }),
  ]);
}
