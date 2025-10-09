import {
  InferValidator,
  lazyValidator,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

/**
 * `top_logprobs` request body argument can be set to an integer between
 * 0 and 20 specifying the number of most likely tokens to return at each
 * token position, each with an associated log probability.
 *
 * @see https://platform.openai.com/docs/api-reference/responses/create#responses_create-top_logprobs
 */
export const TOP_LOGPROBS_MAX = 20;

export const openaiResponsesReasoningModelIds = [
  'o1',
  'o1-2024-12-17',
  'o3-mini',
  'o3-mini-2025-01-31',
  'o3',
  'o3-2025-04-16',
  'o4-mini',
  'o4-mini-2025-04-16',
  'codex-mini-latest',
  'computer-use-preview',
  'gpt-5',
  'gpt-5-2025-08-07',
  'gpt-5-codex',
  'gpt-5-mini',
  'gpt-5-mini-2025-08-07',
  'gpt-5-nano',
  'gpt-5-nano-2025-08-07',
  'gpt-5-pro',
  'gpt-5-pro-2025-10-06',
] as const;

export const openaiResponsesModelIds = [
  'gpt-4.1',
  'gpt-4.1-2025-04-14',
  'gpt-4.1-mini',
  'gpt-4.1-mini-2025-04-14',
  'gpt-4.1-nano',
  'gpt-4.1-nano-2025-04-14',
  'gpt-4o',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-11-20',
  'gpt-4o-audio-preview',
  'gpt-4o-audio-preview-2024-10-01',
  'gpt-4o-audio-preview-2024-12-17',
  'gpt-4o-search-preview',
  'gpt-4o-search-preview-2025-03-11',
  'gpt-4o-mini-search-preview',
  'gpt-4o-mini-search-preview-2025-03-11',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'gpt-4-turbo-preview',
  'gpt-4-0125-preview',
  'gpt-4-1106-preview',
  'gpt-4',
  'gpt-4-0613',
  'gpt-4.5-preview',
  'gpt-4.5-preview-2025-02-27',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106',
  'chatgpt-4o-latest',
  'gpt-5-chat-latest',
  ...openaiResponsesReasoningModelIds,
] as const;

export type OpenAIResponsesModelId =
  | 'chatgpt-4o-latest'
  | 'gpt-3.5-turbo-0125'
  | 'gpt-3.5-turbo-1106'
  | 'gpt-3.5-turbo'
  | 'gpt-4-0613'
  | 'gpt-4-turbo-2024-04-09'
  | 'gpt-4-turbo'
  | 'gpt-4.1-2025-04-14'
  | 'gpt-4.1-mini-2025-04-14'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-nano-2025-04-14'
  | 'gpt-4.1-nano'
  | 'gpt-4.1'
  | 'gpt-4'
  | 'gpt-4o-2024-05-13'
  | 'gpt-4o-2024-08-06'
  | 'gpt-4o-2024-11-20'
  | 'gpt-4o-mini-2024-07-18'
  | 'gpt-4o-mini'
  | 'gpt-4o'
  | 'gpt-5-2025-08-07'
  | 'gpt-5-chat-latest'
  | 'gpt-5-codex'
  | 'gpt-5-mini-2025-08-07'
  | 'gpt-5-mini'
  | 'gpt-5-nano-2025-08-07'
  | 'gpt-5-nano'
  | 'gpt-5-pro-2025-10-06'
  | 'gpt-5-pro'
  | 'gpt-5'
  | 'o1-2024-12-17'
  | 'o1'
  | 'o3-2025-04-16'
  | 'o3-mini-2025-01-31'
  | 'o3-mini'
  | 'o3'
  | (string & {});

// TODO AI SDK 6: use optional here instead of nullish
export const openaiResponsesProviderOptionsSchema = lazyValidator(() =>
  zodSchema(
    z.object({
      include: z
        .array(
          z.enum([
            'reasoning.encrypted_content',
            'file_search_call.results',
            'message.output_text.logprobs',
          ]),
        )
        .nullish(),
      instructions: z.string().nullish(),

      /**
       * Return the log probabilities of the tokens.
       *
       * Setting to true will return the log probabilities of the tokens that
       * were generated.
       *
       * Setting to a number will return the log probabilities of the top n
       * tokens that were generated.
       *
       * @see https://platform.openai.com/docs/api-reference/responses/create
       * @see https://cookbook.openai.com/examples/using_logprobs
       */
      logprobs: z
        .union([z.boolean(), z.number().min(1).max(TOP_LOGPROBS_MAX)])
        .optional(),

      /**
       * The maximum number of total calls to built-in tools that can be processed in a response.
       * This maximum number applies across all built-in tool calls, not per individual tool.
       * Any further attempts to call a tool by the model will be ignored.
       */
      maxToolCalls: z.number().nullish(),

      metadata: z.any().nullish(),
      parallelToolCalls: z.boolean().nullish(),
      previousResponseId: z.string().nullish(),
      promptCacheKey: z.string().nullish(),
      reasoningEffort: z.string().nullish(),
      reasoningSummary: z.string().nullish(),
      safetyIdentifier: z.string().nullish(),
      serviceTier: z.enum(['auto', 'flex', 'priority', 'default']).nullish(),
      store: z.boolean().nullish(),
      strictJsonSchema: z.boolean().nullish(),
      textVerbosity: z.enum(['low', 'medium', 'high']).nullish(),
      user: z.string().nullish(),
    }),
  ),
);

export type OpenAIResponsesProviderOptions = InferValidator<
  typeof openaiResponsesProviderOptionsSchema
>;
