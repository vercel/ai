import { z } from 'zod/v4';

// SiliconFlow model IDs follow the pattern: provider/model-name
// e.g., Qwen/Qwen3-32B, deepseek-ai/DeepSeek-R1, THUDM/glm-4-9b-chat
export type SiliconFlowChatModelId =
  | 'Qwen/Qwen3-32B'
  | 'deepseek-ai/DeepSeek-R1'
  | 'THUDM/glm-4-9b-chat'
  | (string & {});

export const siliconFlowLanguageModelChatOptions = z.object({
  /**
   * Whether to enable thinking mode for reasoning models.
   * When enabled, the model outputs reasoning_content in addition to content.
   */
  enableThinking: z.boolean().optional(),

  /**
   * Controls the token budget for thinking/reasoning steps.
   */
  thinkingBudget: z.number().optional(),

  /**
   * Minimum probability threshold for dynamic filtering.
   */
  minP: z.number().optional(),
});

export type SiliconFlowLanguageModelChatOptions = z.infer<
  typeof siliconFlowLanguageModelChatOptions
>;
