import {
  LanguageModelV1FunctionTool,
  LanguageModelV1ToolChoice,
} from '@ai-sdk/provider';
import { CoreTool } from '../tool/tool';
import { CoreToolChoice } from '../types/language-model';
import { convertZodToJSONSchema } from '../util/convert-zod-to-json-schema';
import { isNonEmptyObject } from '../util/is-non-empty-object';

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
      parameters: convertZodToJSONSchema(tool.parameters),
    })),
    toolChoice:
      toolChoice == null
        ? { type: 'auto' }
        : typeof toolChoice === 'string'
        ? { type: toolChoice }
        : { type: 'tool' as const, toolName: toolChoice.toolName as string },
  };
}
