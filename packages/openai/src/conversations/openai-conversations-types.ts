import { z } from 'zod/v4';

export const conversationSchema = z.object({
  id: z.string(),
  object: z.literal('conversation'),
  created_at: z.number(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const conversationItemSchema = z
  .object({
    type: z.string(),
    id: z.string().optional(),
    status: z.string().optional(),
    role: z.string().optional(),
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
    created_at: z.number().optional(),
  })
  .passthrough();

export type ConversationItem = z.infer<typeof conversationItemSchema>;

export const conversationItemListSchema = z.object({
  object: z.literal('list'),
  data: z.array(conversationItemSchema),
  first_id: z.string().optional(),
  last_id: z.string().optional(),
  has_more: z.boolean(),
});

export type ConversationItemList = z.infer<typeof conversationItemListSchema>;

export const deletedConversationSchema = z.object({
  id: z.string(),
  object: z.literal('conversation.deleted'),
  deleted: z.boolean(),
});

export type DeletedConversation = z.infer<typeof deletedConversationSchema>;

export interface CreateConversationRequest {
  items?: Array<{
    type: 'message';
    role: 'user' | 'assistant' | 'system' | 'developer';
    content: string | Array<unknown>;
  }>;
  metadata?: Record<string, string>;
}

export interface UpdateConversationRequest {
  metadata: Record<string, string>;
}

export interface ListItemsOptions {
  after?: string;
  include?: Array<
    | 'code_interpreter_call.outputs'
    | 'computer_call_output.output.image_url'
    | 'file_search_call.results'
    | 'message.input_image.image_url'
    | 'message.output_text.logprobs'
    | 'reasoning.encrypted_content'
  >;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface CreateItemsRequest {
  items: Array<{
    type: 'message';
    role: 'user' | 'assistant' | 'system' | 'developer';
    content: string | Array<unknown>;
  }>;
}

export interface RetrieveItemOptions {
  include?: Array<
    | 'code_interpreter_call.outputs'
    | 'computer_call_output.output.image_url'
    | 'file_search_call.results'
    | 'message.input_image.image_url'
    | 'message.output_text.logprobs'
    | 'reasoning.encrypted_content'
  >;
}
