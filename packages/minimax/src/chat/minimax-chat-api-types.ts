import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MiniMaxChatPrompt = Array<MiniMaxMessage>;

export type MiniMaxMessage =
  | MiniMaxSystemMessage
  | MiniMaxUserMessage
  | MiniMaxAssistantMessage
  | MiniMaxToolMessage;

export interface MiniMaxSystemMessage {
  role: 'system';
  content: string;
}

export interface MiniMaxUserMessage {
  role: 'user';
  content: string;
}

export interface MiniMaxAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<MiniMaxMessageToolCall>;
}

export interface MiniMaxMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface MiniMaxToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

export interface MiniMaxFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string | undefined;
    parameters: unknown;
    strict?: boolean;
  };
}

export type MiniMaxToolChoice =
  | { type: 'function'; function: { name: string } }
  | 'auto'
  | 'none'
  | 'required'
  | undefined;

const tokenUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
  })
  .nullish();

export type MiniMaxChatTokenUsage = z.infer<typeof tokenUsageSchema>;

export const minimaxErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type MiniMaxErrorData = z.infer<typeof minimaxErrorSchema>;

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const minimaxChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: tokenUsageSchema,
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const minimaxChatChunkSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        id: z.string().nullish(),
        created: z.number().nullish(),
        model: z.string().nullish(),
        choices: z.array(
          z.object({
            delta: z
              .object({
                role: z.enum(['assistant']).nullish(),
                content: z.string().nullish(),
                tool_calls: z
                  .array(
                    z.object({
                      index: z.number(),
                      id: z.string().nullish(),
                      function: z.object({
                        name: z.string().nullish(),
                        arguments: z.string().nullish(),
                      }),
                    }),
                  )
                  .nullish(),
              })
              .nullish(),
            finish_reason: z.string().nullish(),
          }),
        ),
        usage: tokenUsageSchema,
      }),
      minimaxErrorSchema,
    ]),
  ),
);
