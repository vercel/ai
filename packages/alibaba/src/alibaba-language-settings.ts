import { z } from 'zod/v4';

// https://www.alibabacloud.com/help/en/model-studio/models
export type AlibabaLanguageModelId =
  // flagship models
  | 'qwen-max'
  | 'qwen-max-latest'
  | 'qwen-plus'
  | 'qwen-plus-latest'
  | 'qwen-flash'
  | 'qwen-turbo'
  // thinking/reasoning models
  | 'qwen3-max'
  | 'qwen3-max-preview'
  | 'qwen3-max-2026-01-23'
  | 'qwq-plus'
  // code models
  | 'qwen-coder'
  | 'qwen3-coder-plus'
  | 'qwen3-coder-flash'
  // vision models
  | 'qwen3-vl-plus'
  | 'qwen3-vl-flash'
  | 'qwen-vl-max'
  | 'qwen-vl-plus'
  | (string & {});

export const alibabaLanguageModelOptions = z.object({
  /**
   * Enable thinking/reasoning mode for supported models.
   * When enabled, the model generates reasoning content before the response.
   *
   * @default false
   */
  enableThinking: z.boolean().optional(),

  /**
   * Maximum number of reasoning tokens to generate.
   * Limits the length of thinking content.
   */
  thinkingBudget: z.number().positive().optional(),

  /**
   * Whether to enable parallel function calling during tool use.
   *
   * @default true
   */
  parallelToolCalls: z.boolean().optional(),
});

export type AlibabaLanguageModelOptions = z.infer<
  typeof alibabaLanguageModelOptions
>;
