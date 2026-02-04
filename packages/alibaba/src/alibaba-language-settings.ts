import { z } from 'zod/v4';

// https://www.alibabacloud.com/help/en/model-studio/models
export type AlibabaLanguageModelId =
  // commercial edition - hybrid-thinking mode (disabled by default)
  // qwen-max series
  | 'qwen3-max'
  | 'qwen3-max-2026-01-23'
  | 'qwen3-max-preview'
  // qwen-plus series
  | 'qwen-plus'
  | 'qwen-plus-latest'
  | 'qwen-plus-2025-04-28'
  // qwen-flash series
  | 'qwen-flash'
  | 'qwen-flash-2025-07-28'
  // qwen-turbo series
  | 'qwen-turbo'
  | 'qwen-turbo-latest'
  | 'qwen-turbo-2025-04-28'
  // open-source edition - hybrid-thinking mode (enabled by default)
  | 'qwen3-235b-a22b'
  | 'qwen3-32b'
  | 'qwen3-30b-a3b'
  | 'qwen3-14b'
  | 'qwen3-8b'
  | 'qwen3-4b'
  | 'qwen3-1.7b'
  | 'qwen3-0.6b'
  // thinking-only mode
  | 'qwen3-next-80b-a3b-thinking'
  | 'qwen3-235b-a22b-thinking-2507'
  | 'qwen3-30b-a3b-thinking-2507'
  | 'qwq-plus'
  | 'qwq-plus-latest'
  | 'qwq-plus-2025-03-05'
  | 'qwq-32b'
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
