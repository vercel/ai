import type { LanguageModelV4ToolChoice } from '@ai-sdk/provider';
import type { ToolChoice } from '../types/language-model';

export function prepareToolChoice({
  toolChoice,
}: {
  // use of any because it doesn't matter for tool choice preparation
  toolChoice: ToolChoice<any> | undefined;
}): LanguageModelV4ToolChoice {
  if (toolChoice == null) {
    return { type: 'auto' };
  }
  if (typeof toolChoice === 'string') {
    return { type: toolChoice };
  }
  if (toolChoice.type === 'allowedTools') {
    return {
      type: 'allowedTools',
      toolNames: toolChoice.toolNames as string[],
      ...(toolChoice.mode != null ? { mode: toolChoice.mode } : {}),
    };
  }
  return { type: 'tool' as const, toolName: toolChoice.toolName as string };
}
