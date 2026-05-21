import type {
  LanguageModelV4FunctionTool,
  LanguageModelV4ProviderTool,
} from '@ai-sdk/provider';
import {
  asSchema,
  type Experimental_Sandbox as Sandbox,
  type InferToolSetContext,
  type Tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { isNonEmptyObject } from '../util/is-non-empty-object';

export async function prepareTools<TOOLS extends ToolSet>({
  tools,
  toolsContext = {} as InferToolSetContext<TOOLS>,
  experimental_sandbox: sandbox,
}: {
  tools: TOOLS | undefined;
  toolsContext?: InferToolSetContext<TOOLS>;
  experimental_sandbox?: Sandbox;
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
      case 'function': {
        const description = resolveToolDescription({
          tool,
          toolName: name,
          toolsContext,
          experimental_sandbox: sandbox,
        });
        const providerOptions = tool.providerOptions;
        const inputExamples = tool.inputExamples;
        const strict = tool.strict;

        languageModelTools.push({
          type: 'function' as const,
          name,
          inputSchema: await asSchema(tool.inputSchema).jsonSchema,
          ...(description != null ? { description } : {}),
          ...(inputExamples != null ? { inputExamples } : {}),
          ...(providerOptions != null ? { providerOptions } : {}),
          ...(strict != null ? { strict } : {}),
        });
        break;
      }
      case 'provider': {
        languageModelTools.push({
          type: 'provider' as const,
          name,
          id: tool.id,
          args: tool.args,
        });
        break;
      }
      default: {
        const exhaustiveCheck: never = toolType as never;
        throw new Error(`Unsupported tool type: ${exhaustiveCheck}`);
      }
    }
  }

  return languageModelTools;
}

function resolveToolDescription<TOOLS extends ToolSet>({
  tool,
  toolName,
  toolsContext,
  experimental_sandbox: sandbox,
}: {
  tool: Tool;
  toolName: string;
  toolsContext: InferToolSetContext<TOOLS>;
  experimental_sandbox?: Sandbox;
}): string | undefined {
  return tool.description === undefined
    ? undefined
    : typeof tool.description === 'string'
      ? tool.description
      : tool.description({
          context: toolsContext[toolName as keyof InferToolSetContext<TOOLS>],
          experimental_sandbox: sandbox,
        });
}
