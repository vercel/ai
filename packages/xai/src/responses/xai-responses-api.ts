import { z } from 'zod/v4';

export type XaiResponsesInput = Array<XaiResponsesInputItem>;

export type XaiResponsesInputItem =
  | XaiResponsesSystemMessage
  | XaiResponsesUserMessage
  | XaiResponsesAssistantMessage;

export type XaiResponsesSystemMessage = {
  role: 'system' | 'developer';
  content: string;
};

export type XaiResponsesUserMessage = {
  role: 'user';
  content: string;
};

export type XaiResponsesAssistantMessage = {
  role: 'assistant';
  content: string;
};

export type XaiResponsesTool =
  | {
      type: 'web_search';
      allowed_domains?: string[];
      excluded_domains?: string[];
      enable_image_understanding?: boolean;
    }
  | {
      type: 'x_search';
      allowed_x_handles?: string[];
      excluded_x_handles?: string[];
      from_date?: string;
      to_date?: string;
      enable_image_understanding?: boolean;
      enable_video_understanding?: boolean;
    }
  | { type: 'code_interpreter' }
  | { type: 'file_search' }
  | { type: 'mcp' }
  | {
      type: 'function';
      function: {
        name: string;
        description?: string;
        parameters: unknown;
      };
    };

const annotationSchema = z.union([
  z.object({
    type: z.literal('url_citation'),
    url: z.string(),
    title: z.string().optional(),
  }),
  z.object({
    type: z.string(),
  }),
]);

const messageContentPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  logprobs: z.array(z.any()).optional(),
  annotations: z.array(annotationSchema).optional(),
});

const toolCallSchema = z.object({
  name: z.string(),
  arguments: z.string(),
  call_id: z.string(),
  id: z.string(),
  status: z.string(),
});

const outputItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('web_search_call'),
    ...toolCallSchema.shape,
  }),
  z.object({
    type: z.literal('x_search_call'),
    ...toolCallSchema.shape,
  }),
  z.object({
    type: z.literal('code_interpreter_call'),
    ...toolCallSchema.shape,
  }),
  z.object({
    type: z.literal('code_execution_call'),
    ...toolCallSchema.shape,
  }),
  z.object({
    type: z.literal('view_image_call'),
    ...toolCallSchema.shape,
  }),
  z.object({
    type: z.literal('view_x_video_call'),
    ...toolCallSchema.shape,
  }),
  z.object({
    type: z.literal('message'),
    role: z.string(),
    content: z.array(messageContentPartSchema),
    id: z.string(),
    status: z.string(),
  }),
  z.object({
    type: z.literal('function_call'),
    name: z.string(),
    arguments: z.string(),
    call_id: z.string(),
    id: z.string(),
  }),
]);

export const xaiResponsesUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number().optional(),
  input_tokens_details: z
    .object({
      cached_tokens: z.number().optional(),
    })
    .optional(),
  output_tokens_details: z
    .object({
      reasoning_tokens: z.number().optional(),
    })
    .optional(),
  num_sources_used: z.number().optional(),
  num_server_side_tools_used: z.number().optional(),
});

export const xaiResponsesResponseSchema = z.object({
  id: z.string().nullish(),
  created_at: z.number().nullish(),
  model: z.string().nullish(),
  object: z.literal('response'),
  output: z.array(outputItemSchema),
  usage: xaiResponsesUsageSchema,
  status: z.string(),
});

export const xaiResponsesChunkSchema = z.union([
  z.object({
    type: z.literal('response.created'),
    response: xaiResponsesResponseSchema.partial({ usage: true, status: true }),
  }),
  z.object({
    type: z.literal('response.in_progress'),
    response: xaiResponsesResponseSchema.partial({ usage: true, status: true }),
  }),
  z.object({
    type: z.literal('response.output_item.added'),
    item: outputItemSchema,
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.output_item.done'),
    item: outputItemSchema,
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.content_part.added'),
    item_id: z.string(),
    output_index: z.number(),
    content_index: z.number(),
    part: messageContentPartSchema,
  }),
  z.object({
    type: z.literal('response.output_text.delta'),
    item_id: z.string(),
    output_index: z.number(),
    content_index: z.number(),
    delta: z.string(),
    logprobs: z.array(z.any()).optional(),
  }),
  z.object({
    type: z.literal('response.output_text.done'),
    item_id: z.string(),
    output_index: z.number(),
    content_index: z.number(),
    text: z.string(),
    logprobs: z.array(z.any()).optional(),
    annotations: z.array(annotationSchema).optional(),
  }),
  z.object({
    type: z.literal('response.output_text.annotation.added'),
    item_id: z.string(),
    output_index: z.number(),
    content_index: z.number(),
    annotation_index: z.number(),
    annotation: annotationSchema,
  }),
  z.object({
    type: z.literal('response.done'),
    response: xaiResponsesResponseSchema,
  }),
  z.object({
    type: z.literal('response.completed'),
    response: xaiResponsesResponseSchema,
  }),
]);

export type XaiResponsesResponse = z.infer<typeof xaiResponsesResponseSchema>;
export type XaiResponsesChunk = z.infer<typeof xaiResponsesChunkSchema>;
export type XaiResponsesUsage = z.infer<typeof xaiResponsesUsageSchema>;
