import {
  JSONObject,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { BedrockTool, BedrockToolConfiguration } from './bedrock-api-types';

/**
 * Check if the conversation contains any tool calls or tool results.
 * Bedrock requires toolConfig to be present when messages contain toolUse or toolResult blocks.
 */
function promptContainsToolContent(prompt: LanguageModelV2Prompt): boolean {
  return prompt.some(message => {
    if ('content' in message && Array.isArray(message.content)) {
      return message.content.some(
        part => part.type === 'tool-call' || part.type === 'tool-result',
      );
    }
    return false;
  });
}

export function prepareTools({
  tools,
  toolChoice,
  prompt,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  prompt: LanguageModelV2Prompt;
}): {
  toolConfig: BedrockToolConfiguration;
  toolWarnings: LanguageModelV2CallWarning[];
} {
  tools = tools?.length ? tools : undefined;

  const hasToolContent = promptContainsToolContent(prompt);

  if (tools == null) {
    return {
      toolConfig: { tools: hasToolContent ? [] : undefined, toolChoice: undefined },
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
      // Bedrock does not support 'none' tool choice, so we remove the tools.
      // However, if conversation contains tool content, we need empty tools array for API.
      return {
        toolConfig: { tools: hasToolContent ? [] : undefined, toolChoice: undefined },
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
