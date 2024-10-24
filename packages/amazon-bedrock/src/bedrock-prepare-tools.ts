import { LanguageModelV1, LanguageModelV1CallWarning } from '@ai-sdk/provider';
import {
  Tool,
  ToolConfiguration,
  ToolInputSchema,
} from '@aws-sdk/client-bedrock-runtime';

export function prepareTools(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
): {
  toolConfiguration: ToolConfiguration;
  toolWarnings: LanguageModelV1CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return {
      toolConfiguration: { tools: undefined, toolChoice: undefined },
      toolWarnings: [],
    };
  }

  const toolWarnings: LanguageModelV1CallWarning[] = [];
  const bedrockTools: Tool[] = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    } else {
      bedrockTools.push({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: tool.parameters,
          } as ToolInputSchema,
        },
      });
    }
  }

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return {
      toolConfiguration: { tools: bedrockTools, toolChoice: undefined },
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        toolConfiguration: { tools: bedrockTools, toolChoice: { auto: {} } },
        toolWarnings,
      };
    case 'required':
      return {
        toolConfiguration: { tools: bedrockTools, toolChoice: { any: {} } },
        toolWarnings,
      };
    case 'none':
      // Bedrock does not support 'none' tool choice, so we remove the tools:
      return {
        toolConfiguration: { tools: undefined, toolChoice: undefined },
        toolWarnings,
      };
    case 'tool':
      return {
        toolConfiguration: {
          tools: bedrockTools,
          toolChoice: { tool: { name: toolChoice.toolName } },
        },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}
