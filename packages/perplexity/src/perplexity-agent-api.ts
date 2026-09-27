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

const handledOutputTypes = [
  'message',
  'search_results',
  'fetch_url_results',
  'function_call',
];

export const perplexityOutputItemSchema = z.union([
  z.looseObject({
    type: z.literal('message'),
    id: z.string().nullish(),
    content: z.array(perplexityContentPartSchema).nullish(),
  }),
  z.looseObject({
    type: z.literal('search_results'),
    results: z.array(perplexitySearchResultSchema).nullish(),
  }),
  z.looseObject({
    type: z.literal('fetch_url_results'),
    contents: z.array(perplexityFetchedContentSchema).nullish(),
  }),
  z.looseObject({
    type: z.literal('function_call'),
    id: z.string().nullish(),
    call_id: z.string().nullish(),
    name: z.string().nullish(),
    arguments: z.string().nullish(),
    thought_signature: z.string().nullish(),
  }),
  // Native tool traces remain available in raw responses and raw stream chunks.
  // Their fields (e.g. finance_results.results) have different shapes. Do not
  // validate them as search results, or let malformed handled items fall back.
  z
    .object({
      type: z.string().refine(type => !handledOutputTypes.includes(type)),
    })
    .transform(() => ({ type: 'unhandled' as const })),
]);

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
  incomplete_details: z
    .looseObject({
      reason: z.string(),
    })
    .nullish(),
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
  thought: z.string().optional(),
  queries: z.array(z.string()).optional(),
  urls: z.array(z.string()).optional(),
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
