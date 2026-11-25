import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AlibabaModelIds } from './alibaba-model-catalog';

// https://www.alibabacloud.com/help/en/model-studio/models
export type AlibabaChatModelId = AlibabaModelIds['language'] | (string & {});

export const alibabaLanguageModelChatOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Enable thinking/reasoning mode for supported models.
       * When enabled, the model generates reasoning content before the response.
       *
       * @default false
       */
      enableThinking: z.boolean().optional(),

      /**
       * Maximum number of reasoning tokens to generate.
       */
      thinkingBudget: z.number().positive().optional(),

      /**
       * Reasoning effort level, sent as `reasoning_effort`. Alibaba maps the
       * value to the levels a model supports (for example, `qwen4-max` treats
       * `medium` as `high` and `max` as `xhigh`), and `none` disables
       * thinking. Some models reject `reasoning_effort` together with
       * `thinkingBudget`.
       */
      reasoningEffort: z
        .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
        .optional(),

      /**
       * Request-level prompt cache settings, sent as `prompt_cache_options`.
       *
       * `mode: 'implicit'` places an automatic cache breakpoint at the end of
       * the input; `mode: 'explicit'` caches only at `cacheControl`
       * breakpoints. `ttl` sets the cache lifetime for every breakpoint in the
       * request (`5m` by default).
       */
      promptCacheOptions: z
        .object({
          mode: z.enum(['implicit', 'explicit']).optional(),
          ttl: z.enum(['5m', '1h']).optional(),
        })
        .optional(),

      /**
       * Whether to preserve reasoning from previous assistant messages.
       *
       * When enabled, historical reasoning is sent separately as
       * `reasoning_content` and Alibaba receives `preserve_thinking: true`.
       * Defaults to `true` for models that support preserved thinking; set to
       * `false` to opt out.
       */
      preserveThinking: z.boolean().optional(),

      /**
       * Whether to enable parallel function calling during tool use.
       *
       * @default true
       */
      parallelToolCalls: z.boolean().optional(),
    }),
  ),
);

export type AlibabaLanguageModelChatOptions = InferSchema<
  typeof alibabaLanguageModelChatOptions
>;
