import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Request

export interface DeepSeekResponsesInputTextContent {
  type: 'input_text';
  text: string;
}

export interface DeepSeekResponsesOutputTextContent {
  type: 'output_text';
  text: string;
}

export interface DeepSeekResponsesUserMessage {
  type: 'message';
  role: 'user';
  content: Array<DeepSeekResponsesInputTextContent>;
}

export interface DeepSeekResponsesAssistantMessage {
  type: 'message';
  role: 'assistant';
  content: Array<DeepSeekResponsesOutputTextContent>;
}

export interface DeepSeekResponsesReasoningItem {
  type: 'reasoning';
  id?: string;
  summary: [];
  content?: Array<{ type: 'reasoning_text'; text: string }>;
}

export interface DeepSeekResponsesFunctionCallItem {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface DeepSeekResponsesFunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/**
 * Sent back verbatim on later turns - DeepSeek restores the search results
 * server-side from the call id, but rejects the item without its action.
 */
export interface DeepSeekResponsesWebSearchCallItem {
  type: 'web_search_call';
  id: string;
  action: DeepSeekResponsesWebSearchCallAction;
}

export type DeepSeekResponsesWebSearchCallAction =
  | { type: 'search'; queries: Array<string> }
  | { type: 'open_page'; url: string };

export type DeepSeekResponsesInputItem =
  | DeepSeekResponsesUserMessage
  | DeepSeekResponsesAssistantMessage
  | DeepSeekResponsesReasoningItem
  | DeepSeekResponsesFunctionCallItem
  | DeepSeekResponsesFunctionCallOutputItem
  | DeepSeekResponsesWebSearchCallItem;

export interface DeepSeekResponsesFunctionTool {
  type: 'function';
  name: string;
  description: string | undefined;
  parameters: unknown;
  strict?: boolean;
}

export type DeepSeekResponsesTool =
  | DeepSeekResponsesFunctionTool
  | { type: 'web_search' };

export type DeepSeekResponsesToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; name: string }
  | { type: 'web_search' };

// Response
//
// Limited versions of the schemas, focussed on what is needed for the
// implementation. This approach limits breakages when the API changes and
// increases efficiency.

const usageSchema = z
  .object({
    input_tokens: z.number().nullish(),
    input_tokens_details: z
      .object({ cached_tokens: z.number().nullish() })
      .nullish(),
    output_tokens: z.number().nullish(),
    output_tokens_details: z
      .object({ reasoning_tokens: z.number().nullish() })
      .nullish(),
    total_tokens: z.number().nullish(),
  })
  .nullish();

export type DeepSeekResponsesUsage = z.infer<typeof usageSchema>;

const webSearchActionSchema = z.union([
  z.object({
    type: z.literal('search'),
    queries: z.array(z.string()).nullish(),
  }),
  z.object({
    type: z.literal('open_page'),
    url: z.string().nullish(),
  }),
  // catch-all for action types we do not map, e.g. find_in_page:
  z
    .object({ type: z.string() })
    .loose()
    .transform(() => ({ type: 'unknown_action' as const })),
]);

export type DeepSeekResponsesWebSearchAction = z.infer<
  typeof webSearchActionSchema
>;

const outputItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    id: z.string().nullish(),
    content: z.array(
      z.object({
        type: z.literal('output_text'),
        text: z.string(),
      }),
    ),
  }),
  z.object({
    type: z.literal('reasoning'),
    id: z.string().nullish(),
    content: z
      .array(z.object({ type: z.literal('reasoning_text'), text: z.string() }))
      .nullish(),
  }),
  z.object({
    type: z.literal('function_call'),
    id: z.string().nullish(),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
  }),
  z.object({
    type: z.literal('web_search_call'),
    id: z.string(),
    action: webSearchActionSchema.nullish(),
  }),
]);

export type DeepSeekResponsesOutputItem = z.infer<typeof outputItemSchema>;

const responseSchema = z.object({
  id: z.string().nullish(),
  created_at: z.number().nullish(),
  model: z.string().nullish(),
  status: z.string().nullish(),
  incomplete_details: z.object({ reason: z.string().nullish() }).nullish(),
  output: z.array(outputItemSchema).nullish(),
  usage: usageSchema,
});

export const deepseekResponsesResponseSchema = lazySchema(() =>
  zodSchema(responseSchema),
);

export const deepseekResponsesChunkSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        type: z.enum(['response.created', 'response.completed']),
        response: responseSchema,
      }),
      z.object({
        type: z.enum(['response.incomplete', 'response.failed']),
        response: responseSchema.extend({
          error: z
            .object({
              code: z.string().nullish(),
              message: z.string().nullish(),
            })
            .nullish(),
        }),
      }),
      z.object({
        type: z.enum([
          'response.output_item.added',
          'response.output_item.done',
        ]),
        output_index: z.number(),
        item: outputItemSchema,
      }),
      z.object({
        type: z.enum([
          'response.output_text.delta',
          'response.reasoning_text.delta',
          'response.function_call_arguments.delta',
        ]),
        item_id: z.string(),
        delta: z.string(),
      }),
      // catch-all for events we do not act on, e.g. response.in_progress and
      // the *.done counterparts of the delta events:
      z
        .object({ type: z.string() })
        .loose()
        .transform(() => ({ type: 'unknown_chunk' as const })),
    ]),
  ),
);
