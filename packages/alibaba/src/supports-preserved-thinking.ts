/**
 * Whether a model id supports Alibaba's preserved-thinking mode
 * (`preserve_thinking`), which replays assistant `reasoning_content` from
 * previous turns.
 *
 * Supported models per Alibaba's documentation:
 * https://docs.qwencloud.com/developer-guides/text-generation/thinking#preserve-thinking-in-multi-turn
 */
const preservedThinkingModelIds = new Set([
  'kimi-k2.7-code',
  'qwen3.6-max-preview',
  'qwen3.6-plus',
  'qwen3.6-plus-2026-04-02',
  'qwen3.7-flash',
  'qwen3.7-flash-2026-07-15',
  'qwen3.7-max',
  'qwen3.7-max-2026-05-17',
  'qwen3.7-max-2026-05-20',
  'qwen3.7-max-2026-06-08',
  'qwen3.7-max-preview',
  'qwen3.7-plus',
  'qwen3.7-plus-2026-05-26',
  'qwen3.8-flash',
  'qwen3.8-max',
  'qwen3.8-max-0902',
]);

export function supportsPreservedThinking(modelId: string): boolean {
  return preservedThinkingModelIds.has(modelId);
}
