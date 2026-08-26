import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MoonshotAIMessages = Array<MoonshotAIMessage>;

export type MoonshotAIMessage =
  | MoonshotAISystemMessage
  | MoonshotAIUserMessage
  | MoonshotAIAssistantMessage
  | MoonshotAIToolMessage;

export interface MoonshotAISystemMessage {
  role: 'system';
  content: string;
}

export interface MoonshotAIUserMessage {
  role: 'user';
  content: string | Array<MoonshotAIContentPart>;
}

export type MoonshotAIContentPart =
  | MoonshotAIContentPartText
  | MoonshotAIContentPartImage
  | MoonshotAIContentPartVideo;

export interface MoonshotAIContentPartText {
  type: 'text';
  text: string;
}

export interface MoonshotAIContentPartImage {
  type: 'image_url';
  image_url: { url: string };
}

export interface MoonshotAIContentPartVideo {
  type: 'video_url';
  video_url: { url: string };
}

export interface MoonshotAIAssistantMessage {
  role: 'assistant';
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: Array<MoonshotAIMessageToolCall>;
}

export interface MoonshotAIMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface MoonshotAIToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

// Schemas below are limited versions focused on what the implementation
// needs. This limits breakages when the API changes and increases efficiency.

const tokenUsageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    cached_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().nullish(),
      })
      .nullish(),
    completion_tokens_details: z
      .object({
        reasoning_tokens: z.number().nullish(),
      })
      .nullish(),
  })
  .nullish();

export type MoonshotAIChatTokenUsage = z.infer<typeof tokenUsageSchema>;

export const moonshotAIErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
  }),
});

export type MoonshotAIErrorData = z.infer<typeof moonshotAIErrorSchema>;

export const moonshotAIChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
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

export const moonshotAIChatChunkSchema = lazySchema(() =>
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
                role: z.literal('assistant').nullish(),
                content: z.string().nullish(),
                reasoning_content: z.string().nullish(),
                tool_calls: z
                  .array(
                    z.object({
                      index: z.number().nullish(),
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
            usage: tokenUsageSchema,
          }),
        ),
        usage: tokenUsageSchema,
      }),
      moonshotAIErrorSchema,
    ]),
  ),
);
