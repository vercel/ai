import { z } from 'zod/v4';

export type XaiResponsesInput = Array<XaiResponsesInputItem>;

export type XaiResponsesInputItem =
  | XaiResponsesSystemMessage
  | XaiResponsesUserMessage
  | XaiResponsesAssistantMessage
  | XaiResponsesFunctionCallOutput
  | XaiResponsesReasoning
  | XaiResponsesToolCall;

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
  id?: string;
};

export type XaiResponsesFunctionCallOutput = {
  type: 'function_call_output';
  call_id: string;
  output: string;
};

export type XaiResponsesReasoning = {
  type: 'reasoning';
  id: string;
  summary: Array<{
    type: 'summary_text';
    text: string;
  }>;
  status: string;
  encrypted_content?: string | null;
};

export type XaiResponsesToolCall = {
  type:
    | 'function_call'
    | 'web_search_call'
    | 'x_search_call'
    | 'code_interpreter_call'
    | 'custom_tool_call';
  id: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  input?: string;
  status: string;
  action?: any;
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
  | { type: 'view_image' }
  | { type: 'view_x_video' }
  | { type: 'file_search' }
  | { type: 'mcp' }
  | {
      type: 'function';
      name: string;
      description?: string;
      parameters: unknown;
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

const reasoningSummaryPartSchema = z.object({
  type: z.string(),
  text: z.string(),
});

const toolCallSchema = z.object({
  name: z.string().optional(),
  arguments: z.string().optional(),
  input: z.string().optional(),
  call_id: z.string().optional(),
  id: z.string(),
  status: z.string(),
  action: z.any().optional(),
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
    type: z.literal('custom_tool_call'),
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
  z.object({
    type: z.literal('reasoning'),
    id: z.string(),
    summary: z.array(reasoningSummaryPartSchema),
    status: z.string(),
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
    type: z.literal('response.content_part.done'),
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
    type: z.literal('response.reasoning_summary_part.added'),
    item_id: z.string(),
    output_index: z.number(),
    summary_index: z.number(),
    part: reasoningSummaryPartSchema,
  }),
  z.object({
    type: z.literal('response.reasoning_summary_part.done'),
    item_id: z.string(),
    output_index: z.number(),
    summary_index: z.number(),
    part: reasoningSummaryPartSchema,
  }),
  z.object({
    type: z.literal('response.reasoning_summary_text.delta'),
    item_id: z.string(),
    output_index: z.number(),
    summary_index: z.number(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('response.reasoning_summary_text.done'),
    item_id: z.string(),
    output_index: z.number(),
    summary_index: z.number(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('response.web_search_call.in_progress'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.web_search_call.searching'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.web_search_call.completed'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.x_search_call.in_progress'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.x_search_call.searching'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.x_search_call.completed'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.custom_tool_call_input.done'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.custom_tool_call_input.delta'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.code_execution_call.in_progress'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.code_execution_call.executing'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.code_execution_call.completed'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.code_interpreter_call.in_progress'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.code_interpreter_call.executing'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.code_interpreter_call.interpreting'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  z.object({
    type: z.literal('response.code_interpreter_call.completed'),
    item_id: z.string(),
    output_index: z.number(),
  }),
  // Code interpreter code streaming events
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
