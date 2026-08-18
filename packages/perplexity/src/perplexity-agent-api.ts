import type { JSONSchema7 } from '@ai-sdk/provider';
import { z } from 'zod/v4';

export type PerplexityAgentTool =
  | {
      type: 'function';
      name: string;
      description?: string;
      parameters: JSONSchema7;
      strict?: boolean;
    }
  | ({ type: string } & Record<string, unknown>);

export const perplexitySearchResultSchema = z.looseObject({
  id: z.number().optional(),
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional(),
  date: z.string().nullish(),
  last_updated: z.string().nullish(),
  source: z.string().optional(),
});

const perplexityFetchedContentSchema = z.looseObject({
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional(),
});

const perplexityContentPartSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  annotations: z
    .array(
      z.looseObject({
        type: z.string().optional(),
        url: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .nullish(),
});

export const perplexityOutputItemSchema = z.looseObject({
  type: z.string(),
  id: z.string().optional(),
  status: z.string().optional(),
  role: z.string().optional(),
  content: z.array(perplexityContentPartSchema).optional(),
  queries: z.array(z.string()).optional(),
  results: z.array(perplexitySearchResultSchema).optional(),
  contents: z.array(perplexityFetchedContentSchema).optional(),
  call_id: z.string().nullish(),
  name: z.string().optional(),
  arguments: z.string().optional(),
  thought_signature: z.string().optional(),
});

const perplexityCostSchema = z.looseObject({
  currency: z.string().optional(),
  input_cost: z.number().optional(),
  output_cost: z.number().optional(),
  total_cost: z.number().optional(),
  cache_creation_cost: z.number().nullish(),
  cache_read_cost: z.number().nullish(),
  tool_calls_cost: z.number().nullish(),
});

export const perplexityUsageSchema = z.looseObject({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  input_tokens_details: z
    .looseObject({
      cached_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    })
    .nullish(),
  output_tokens_details: z
    .looseObject({
      reasoning_tokens: z.number().optional(),
    })
    .nullish(),
  tool_calls_details: z
    .record(
      z.string(),
      z.looseObject({
        invocation: z.number().optional(),
      }),
    )
    .nullish(),
  cost: perplexityCostSchema.nullish(),
});

export const perplexityAgentResponseSchema = z.looseObject({
  id: z.string(),
  created_at: z.number(),
  model: z.string(),
  object: z.literal('response'),
  output: z.array(perplexityOutputItemSchema),
  status: z.string(),
  error: z
    .looseObject({
      code: z.string().optional(),
      message: z.string(),
      type: z.string().optional(),
    })
    .nullish(),
  usage: perplexityUsageSchema.nullish(),
});

export const perplexityAgentChunkSchema = z.looseObject({
  type: z.string(),
  sequence_number: z.number().optional(),
  response: perplexityAgentResponseSchema.optional(),
  item: perplexityOutputItemSchema.optional(),
  output_index: z.number().optional(),
  item_id: z.string().optional(),
  content_index: z.number().optional(),
  delta: z.string().optional(),
  text: z.string().optional(),
  results: z.array(perplexitySearchResultSchema).optional(),
  contents: z.array(perplexityFetchedContentSchema).optional(),
  error: z
    .looseObject({
      code: z.string().optional(),
      message: z.string(),
      type: z.string().optional(),
    })
    .optional(),
});

export const perplexityErrorSchema = z.looseObject({
  error: z
    .union([
      z.string(),
      z.looseObject({
        code: z.union([z.string(), z.number()]).optional(),
        message: z.string().nullish(),
        type: z.string().nullish(),
      }),
    ])
    .optional(),
  detail: z
    .union([
      z.string(),
      z.array(
        z.looseObject({
          msg: z.string(),
        }),
      ),
    ])
    .optional(),
  message: z.string().optional(),
});

export type PerplexityErrorData = z.infer<typeof perplexityErrorSchema>;

export function perplexityErrorToMessage(data: PerplexityErrorData): string {
  if (typeof data.error === 'string') {
    return data.error;
  }
  if (data.error != null) {
    return data.error.message ?? data.error.type ?? 'unknown error';
  }
  if (typeof data.detail === 'string') {
    return data.detail;
  }
  if (Array.isArray(data.detail)) {
    return data.detail.map(detail => detail.msg).join(', ');
  }
  return data.message ?? 'unknown error';
}
