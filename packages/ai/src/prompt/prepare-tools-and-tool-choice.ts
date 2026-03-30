import { LanguageModelV4ToolChoice } from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import { isNonEmptyObject } from '../util/is-non-empty-object';
import { ToolSet } from '../generate-text';
import { ToolDescriptor } from '../generate-text/tool-descriptor';
import { ToolChoice } from '../types/language-model';

export async function prepareToolsAndToolChoice<TOOLS extends ToolSet>({
  tools,
  toolChoice,
  activeTools,
}: {
  tools: TOOLS | undefined;
  toolChoice: ToolChoice<TOOLS> | undefined;
  activeTools: Array<keyof TOOLS> | undefined;
}): Promise<{
  tools: Array<ToolDescriptor> | undefined;
  toolChoice: LanguageModelV4ToolChoice | undefined;
}> {
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

  const languageModelTools: Array<ToolDescriptor> = [];
  for (const [name, tool] of filteredTools) {
    const toolType = tool.type;

    switch (toolType) {
      case undefined:
      case 'dynamic':
      case 'function':
        languageModelTools.push({
          type: 'function' as const,
          name,
          description: tool.description,
          title: tool.title,
          inputSchema: await asSchema(tool.inputSchema).jsonSchema,
          ...(tool.inputExamples != null
            ? { inputExamples: tool.inputExamples }
            : {}),
          providerOptions: tool.providerOptions,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
          hasExecuteFunction: tool.execute != null,
        });
        break;
      case 'provider':
        languageModelTools.push({
          type: 'provider' as const,
          name,
          id: tool.id,
          args: tool.args,
        });
        break;
      default: {
        const exhaustiveCheck: never = toolType as never;
        throw new Error(`Unsupported tool type: ${exhaustiveCheck}`);
      }
    }
  }

  if (languageModelTools.length === 0) {
    return {
      tools: undefined,
      toolChoice: undefined,
    };
  }

  return {
    tools: languageModelTools,
    toolChoice:
      toolChoice == null
        ? { type: 'auto' }
        : typeof toolChoice === 'string'
          ? { type: toolChoice }
          : { type: 'tool' as const, toolName: toolChoice.toolName as string },
  };
}
