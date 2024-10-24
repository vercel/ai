import {
  LanguageModelV1FunctionTool,
  LanguageModelV1ProviderDefinedTool,
  LanguageModelV1ToolChoice,
} from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/ui-utils';
import { CoreTool } from '../tool/tool';
import { CoreToolChoice } from '../types/language-model';
import { isNonEmptyObject } from '../util/is-non-empty-object';

export function prepareToolsAndToolChoice<
  TOOLS extends Record<string, CoreTool>,
>({
  tools,
  toolChoice,
  activeTools,
}: {
  tools: TOOLS | undefined;
  toolChoice: CoreToolChoice<TOOLS> | undefined;
  activeTools: Array<keyof TOOLS> | undefined;
}): {
  tools:
    | Array<LanguageModelV1FunctionTool | LanguageModelV1ProviderDefinedTool>
    | undefined;
  toolChoice: LanguageModelV1ToolChoice | undefined;
} {
  if (!isNonEmptyObject(tools)) {
    return {
      tools: undefined,
      toolChoice: undefined,
    };
  }

  // when activeTools is provided, we only include the tools that are in the list:
  const filteredTools =
    activeTools != null
      ? Object.entries(tools).filter(([name]) =>
          activeTools.includes(name as keyof TOOLS),
        )
      : Object.entries(tools);

  return {
    tools: filteredTools.map(([name, tool]) => {
      const toolType = tool.type;
      switch (toolType) {
        case undefined:
        case 'function':
          return {
            type: 'function' as const,
            name,
            description: tool.description,
            parameters: asSchema(tool.parameters).jsonSchema,
          };
        case 'provider-defined':
          return {
            type: 'provider-defined' as const,
            name,
            id: tool.id,
            args: tool.args,
          };
        default: {
          const exhaustiveCheck: never = toolType;
          throw new Error(`Unsupported tool type: ${exhaustiveCheck}`);
        }
      }
    }),
    toolChoice:
      toolChoice == null
        ? { type: 'auto' }
        : typeof toolChoice === 'string'
        ? { type: toolChoice }
        : { type: 'tool' as const, toolName: toolChoice.toolName as string },
  };
}
