import type { LanguageModelV4ToolChoice } from '@ai-sdk/provider';
import type { ToolChoice } from '../types/language-model';

/**
 * Convert the SDK-level ToolChoice to the provider-level LanguageModelV4ToolChoice.
 *
 * This handles mapping from the user-facing string/object format
 * to the provider interface format.
 */
export function toLanguageModelToolChoice<
  TOOLS extends Record<string, unknown>,
>(
  toolChoice: ToolChoice<TOOLS> | undefined,
): LanguageModelV4ToolChoice | undefined {
  if (toolChoice == null) {
    return undefined;
  }
  if (typeof toolChoice === 'string') {
    return { type: toolChoice };
  }
  return { type: 'tool', toolName: toolChoice.toolName as string };
}
