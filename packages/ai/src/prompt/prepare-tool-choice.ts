import { LanguageModelV4ToolChoice } from '@ai-sdk/provider';
import { ToolSet } from '../generate-text';
import { ToolChoice } from '../types/language-model';
import { isNonEmptyObject } from '../util/is-non-empty-object';

export function prepareToolChoice<TOOLS extends ToolSet>({
  tools,
  toolChoice,
}: {
  tools: TOOLS | undefined;
  toolChoice: ToolChoice<TOOLS> | undefined;
}): LanguageModelV4ToolChoice | undefined {
  if (!isNonEmptyObject(tools)) {
    return undefined;
  }

  return toolChoice == null
    ? { type: 'auto' }
    : typeof toolChoice === 'string'
      ? { type: toolChoice }
      : { type: 'tool' as const, toolName: toolChoice.toolName as string };
}
