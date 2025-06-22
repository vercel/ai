import {
  JSONObject,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { BedrockTool, BedrockToolConfiguration } from './bedrock-api-types';

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
}): {
  toolConfig: BedrockToolConfiguration; // note: do not rename, name required by Bedrock
  toolWarnings: LanguageModelV2CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  if (tools == null) {
    return {
      toolConfig: { tools: undefined, toolChoice: undefined },
      toolWarnings: [],
    };
  }

  const toolWarnings: LanguageModelV2CallWarning[] = [];
  const bedrockTools: BedrockTool[] = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    } else {
      bedrockTools.push({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: tool.inputSchema as JSONObject,
          },
        },
      });
    }
  }

  if (toolChoice == null) {
    return {
      toolConfig: { tools: bedrockTools, toolChoice: undefined },
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        toolConfig: { tools: bedrockTools, toolChoice: { auto: {} } },
        toolWarnings,
      };
    case 'required':
      return {
        toolConfig: { tools: bedrockTools, toolChoice: { any: {} } },
        toolWarnings,
      };
    case 'none':
      // Bedrock does not support 'none' tool choice, so we remove the tools:
      return {
        toolConfig: { tools: undefined, toolChoice: undefined },
        toolWarnings,
      };
    case 'tool':
      return {
        toolConfig: {
          tools: bedrockTools,
          toolChoice: { tool: { name: toolChoice.toolName } },
        },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
