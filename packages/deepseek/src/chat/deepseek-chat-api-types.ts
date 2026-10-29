import {
  type InferSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type DeepSeekChatPrompt = Array<DeepSeekMessage>;

export type DeepSeekMessage =
  | DeepSeekSystemMessage
  | DeepSeekUserMessage
  | DeepSeekAssistantMessage
  | DeepSeekToolMessage;

export interface DeepSeekSystemMessage {
  role: 'system';
  content: string;
  name?: string;
}

export interface DeepSeekUserMessage {
  role: 'user';
  content: string | Array<DeepSeekContentPart>;
  name?: string;
}

export type DeepSeekContentPart =
  | DeepSeekContentPartText
  | DeepSeekContentPartImage
  | DeepSeekContentPartFile;

export interface DeepSeekContentPartText {
  type: 'text';
  text: string;
}

export interface DeepSeekContentPartImage {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'original' | 'auto';
  };
}

export type DeepSeekContentPartFile =
  | {
      type: 'file';
      file_id: string;
    }
  | {
      type: 'file';
      file_data: string;
      filename?: string;
    };

export interface DeepSeekAssistantMessage {
  role: 'assistant';
  content?: string | null;
  name?: string;
  prefix?: true;
  reasoning_content?: string;
  tool_calls?: Array<DeepSeekMessageToolCall>;
}

export interface DeepSeekMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

export interface DeepSeekToolMessage {
  role: 'tool';
  content: string | Array<DeepSeekContentPart>;
  tool_call_id: string;
}

export interface DeepSeekFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string | undefined;
    parameters: unknown;
    strict?: boolean;
  };
}

export type DeepSeekToolChoice =
  | { type: 'function'; function: { name: string } }
  | 'auto'
  | 'none'
  | 'required'
  | undefined;

// Loose, nested objects included: the parsed value is returned as `usage.raw`.
function createTokenUsageSchema() {
  return z
    .looseObject({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
      prompt_cache_hit_tokens: z.number().nullish(),
      prompt_cache_miss_tokens: z.number().nullish(),
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
}

let tokenUsageSchema: ReturnType<typeof createTokenUsageSchema> | undefined;

function getTokenUsageSchema() {
  return (tokenUsageSchema ??= createTokenUsageSchema());
}

export type DeepSeekChatTokenUsage = z.infer<
  ReturnType<typeof getTokenUsageSchema>
>;

function createDeepSeekErrorSchema() {
  return z.object({
    error: z.object({
      message: z.string(),
      type: z.string().nullish(),
      param: z.any().nullish(),
      code: z.union([z.string(), z.number()]).nullish(),
    }),
  });
}

let errorSchema: ReturnType<typeof createDeepSeekErrorSchema> | undefined;

function getDeepSeekErrorSchema() {
  return (errorSchema ??= createDeepSeekErrorSchema());
}

export const deepSeekErrorSchema = lazySchema(() =>
  zodSchema(getDeepSeekErrorSchema()),
);

export type DeepSeekErrorData = InferSchema<typeof deepSeekErrorSchema>;

function createDeepseekChatLogprobsSchema() {
  const deepseekChatLogprobSchema = z.object({
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

  return z
    .object({
      content: z.array(deepseekChatLogprobSchema).nullish(),
      reasoning_content: z.array(deepseekChatLogprobSchema).nullish(),
    })
    .nullish();
}

let logprobsSchema:
  | ReturnType<typeof createDeepseekChatLogprobsSchema>
  | undefined;

function getDeepseekChatLogprobsSchema() {
  return (logprobsSchema ??= createDeepseekChatLogprobsSchema());
}

export type DeepSeekChatLogprob = NonNullable<
  NonNullable<
    z.infer<ReturnType<typeof getDeepseekChatLogprobsSchema>>
  >['content']
>[number];

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const deepseekChatResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      object: z.literal('chat.completion').nullish(),
      system_fingerprint: z.string().nullish(),
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
          logprobs: getDeepseekChatLogprobsSchema(),
          finish_reason: z.string().nullish(),
        }),
      ),
      usage: getTokenUsageSchema(),
    }),
  ),
);

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const deepseekChatChunkSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        id: z.string().nullish(),
        created: z.number().nullish(),
        model: z.string().nullish(),
        object: z.literal('chat.completion.chunk').nullish(),
        system_fingerprint: z.string().nullish(),
        choices: z.array(
          z.object({
            index: z.number().nullish(),
            delta: z
              .object({
                role: z.enum(['assistant']).nullish(),
                content: z.string().nullish(),
                reasoning_content: z.string().nullish(),
                tool_calls: z
                  .array(
                    z.object({
                      index: z.number(),
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
            logprobs: getDeepseekChatLogprobsSchema(),
            finish_reason: z.string().nullish(),
          }),
        ),
        usage: getTokenUsageSchema(),
      }),
      getDeepSeekErrorSchema(),
    ]),
  ),
);
