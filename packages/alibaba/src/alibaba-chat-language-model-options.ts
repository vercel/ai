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
