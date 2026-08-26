import { z } from 'zod/v4';

export type MoonshotAIChatModelId =
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'kimi-k2'
  | 'kimi-k2-0905'
  | 'kimi-k2-thinking'
  | 'kimi-k2-thinking-turbo'
  | 'kimi-k2-turbo'
  | 'kimi-k2.5'
  | 'kimi-k3'
  | (string & {});

export type MoonshotAIModelFamily =
  | 'kimi-k2.5'
  | 'kimi-k2.6'
  | 'kimi-k2.7'
  | 'kimi-k3'
  | 'moonshot-v1'
  | 'unknown';

export function getMoonshotAIModelFamily(
  modelId: MoonshotAIChatModelId,
): MoonshotAIModelFamily {
  if (modelId === 'kimi-k2.5') return 'kimi-k2.5';
  if (modelId === 'kimi-k2.6') return 'kimi-k2.6';
  if (modelId === 'kimi-k2.7-code' || modelId === 'kimi-k2.7-code-highspeed') {
    return 'kimi-k2.7';
  }
  if (modelId === 'kimi-k3') return 'kimi-k3';
  if (modelId.startsWith('moonshot-v1-')) return 'moonshot-v1';
  return 'unknown';
}

export function isMoonshotAIKimiModel(modelId: MoonshotAIChatModelId): boolean {
  return getMoonshotAIModelFamily(modelId).startsWith('kimi-');
}

export const moonshotaiProviderOptions = z.object({
  /**
   * Whether to use strict JSON schema validation for structured outputs.
   *
   * @default true
   */
  strictJsonSchema: z.boolean().optional(),

  /**
   * Reasoning effort for Kimi K3.
   */
  reasoningEffort: z.enum(['low', 'high', 'max']).optional(),

  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      // Accepted so existing callers receive a migration warning. It remains
      // in the public compatibility type below as a deprecated property.
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional(),
});

export type MoonshotAIProviderOptions = {
  /**
   * Whether to use strict JSON schema validation for structured outputs.
   *
   * @default true
   */
  strictJsonSchema?: boolean;

  /** Reasoning effort for Kimi K3. */
  reasoningEffort?: 'low' | 'high' | 'max';

  /** Controls thinking on Kimi K2.5 and K2.6. K2.7 is always enabled. */
  thinking?: {
    type?: 'enabled' | 'disabled';

    /**
     * @deprecated Moonshot Chat Completions does not support thinking budgets.
     * This value is ignored with a warning.
     */
    budgetTokens?: number;
  };

  reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';
};
