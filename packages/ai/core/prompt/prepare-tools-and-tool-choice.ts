import {
  LanguageModelV1FunctionTool,
  LanguageModelV1ToolChoice,
} from '@ai-sdk/provider';
import { CoreTool } from '../tool/tool';
import { CoreToolChoice } from '../types/language-model';
import { isNonEmptyObject } from '../util/is-non-empty-object';
import { asSchema } from '../util/schema';

export function prepareToolsAndToolChoice<
  TOOLS extends Record<string, CoreTool>,
>({
  tools,
  toolChoice,
}: {
  tools: TOOLS | undefined;
  toolChoice: CoreToolChoice<TOOLS> | undefined;
}): {
  tools: LanguageModelV1FunctionTool[] | undefined;
  toolChoice: LanguageModelV1ToolChoice | undefined;
} {
  if (!isNonEmptyObject(tools)) {
    return {
      tools: undefined,
      toolChoice: undefined,
    };
  }

  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      type: 'function' as const,
      name,
      description: tool.description,
      parameters: asSchema(tool.parameters).jsonSchema,
    })),
    toolChoice:
      toolChoice == null
        ? { type: 'auto' }
        : typeof toolChoice === 'string'
        ? { type: toolChoice }
        : { type: 'tool' as const, toolName: toolChoice.toolName as string },
  };
}
