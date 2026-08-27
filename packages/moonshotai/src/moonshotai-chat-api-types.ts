import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MoonshotAIMessages = Array<MoonshotAIMessage>;

export type MoonshotAIMessage =
  | MoonshotAISystemMessage
  | MoonshotAIUserMessage
  | MoonshotAIAssistantMessage
  | MoonshotAIToolMessage;

export type MoonshotAISystemMessage =
  | {
      role: 'system';
      content: string;
      name?: string;
    }
  | {
      role: 'system';
      tools: Array<MoonshotAIFunctionTool>;
    };

export interface MoonshotAIFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string | undefined;
    parameters: unknown;
    strict?: boolean;
  };
}

export interface MoonshotAIUserMessage {
  role: 'user';
  content: string | Array<MoonshotAIContentPart>;
  name?: string;
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
  name?: string;
  partial?: true;
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

// Loose, nested objects included: the parsed value is returned as `usage.raw`.
const tokenUsageSchema = z
  .looseObject({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    cached_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
    prompt_tokens_details: z
      .looseObject({
        cached_tokens: z.number().nullish(),
      })
      .nullish(),
    completion_tokens_details: z
      .looseObject({
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
    code: z.string().nullish(),
  }),
});

export type MoonshotAIErrorData = z.infer<typeof moonshotAIErrorSchema>;

const moonshotAIChatLogprobSchema = z.object({
  token: z.string(),
  logprob: z.number(),
  bytes: z.array(z.number()).nullable(),
  top_logprobs: z.array(
    z.object({
      token: z.string(),
      logprob: z.number(),
      bytes: z.array(z.number()).nullable(),
    }),
  ),
});

const moonshotAIChatLogprobsSchema = z
  .object({
    content: z.array(moonshotAIChatLogprobSchema).nullish(),
  })
  .nullish();

export type MoonshotAIChatLogprob = z.infer<typeof moonshotAIChatLogprobSchema>;

export const moonshotAIChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  object: z.literal('chat.completion').nullish(),
  choices: z.array(
    z.object({
      index: z.number().nullish(),
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              type: z.literal('function').nullish(),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullish(),
      }),
      logprobs: moonshotAIChatLogprobsSchema,
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
        object: z.literal('chat.completion.chunk').nullish(),
        choices: z.array(
          z.object({
            index: z.number().nullish(),
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
                      type: z.literal('function').nullish(),
                      function: z.object({
                        name: z.string().nullish(),
                        arguments: z.string().nullish(),
                      }),
                    }),
                  )
                  .nullish(),
              })
              .nullish(),
            logprobs: moonshotAIChatLogprobsSchema,
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
