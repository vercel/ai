import {
  LanguageModelV4FunctionTool,
  LanguageModelV4ProviderTool,
} from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text';
import { isNonEmptyObject } from '../util/is-non-empty-object';

export async function prepareTools<TOOLS extends ToolSet>({
  tools,
}: {
  tools: TOOLS | undefined;
}): Promise<
  Array<LanguageModelV4FunctionTool | LanguageModelV4ProviderTool> | undefined
> {
  if (!isNonEmptyObject(tools)) {
    return undefined;
  }

  const languageModelTools: Array<
    LanguageModelV4FunctionTool | LanguageModelV4ProviderTool
  > = [];
  for (const [name, tool] of Object.entries(tools)) {
    const toolType = tool.type;

    switch (toolType) {
      case undefined:
      case 'dynamic':
      case 'function':
        if (tool.lazy) {
          languageModelTools.push({
            type: 'function' as const,
            name,
            description: `${tool.description}. IMPORTANT: Call __load_tool_schema__ with this tool's name first to get the required input format before calling this tool.`,
            inputSchema: { type: 'object' as const, properties: {} },
            providerOptions: tool.providerOptions,
          });
        } else {
          languageModelTools.push({
            type: 'function' as const,
            name,
            description: tool.description,
            inputSchema: await asSchema(tool.inputSchema).jsonSchema,
            ...(tool.inputExamples != null
              ? { inputExamples: tool.inputExamples }
              : {}),
            providerOptions: tool.providerOptions,
            ...(tool.strict != null ? { strict: tool.strict } : {}),
          });
        }
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

  return languageModelTools;
}
