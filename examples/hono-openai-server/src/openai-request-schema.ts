import { z } from 'zod';

/*
 * Define partial schemas for message content.
 * A message can be a simple string or a composite array (for e.g. image inputs).
 */
const messageContentPartText = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const messageContentPartImageUrl = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string().url(),
  }),
});

const messageContentSchema = z.union([
  z.string(),
  z.array(z.union([messageContentPartText, messageContentPartImageUrl])),
]);

/*
 * Schema for a chat message for the request.
 */
const chatMessageInputSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'developer']),
  content: messageContentSchema,
});

/*
 * Schema for defining a function/tool (used for function calling) in the Chat request.
 */
const chatCompletionToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.object({
      type: z.literal('object'),
      properties: z.record(z.any()),
      required: z.array(z.string()),
    }),
  }),
});

/*
 * This is the input schema for creating a chat completion.
 * It includes additional options such as temperature, token options, streaming,
 * logging details, tools, and tool_choice.
 */
export const CreateChatCompletionRequest = z.object({
  model: z.string(),
  messages: z.array(chatMessageInputSchema),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  seed: z.number().optional(),
  stream: z.boolean().optional(),
  logprobs: z.boolean().optional(),
  top_logprobs: z.number().optional(),
  tools: z.array(chatCompletionToolSchema).optional(),
  tool_choice: z.union([z.literal('auto'), z.string()]).optional(),
  store: z.boolean().optional(),
});
