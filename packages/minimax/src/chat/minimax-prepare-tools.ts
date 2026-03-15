import { LanguageModelV3CallOptions, SharedV3Warning } from '@ai-sdk/provider';
import {
  MiniMaxFunctionTool,
  MiniMaxToolChoice,
} from './minimax-chat-api-types';

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
}): {
  tools: undefined | Array<MiniMaxFunctionTool>;
  toolChoice: MiniMaxToolChoice;
  toolWarnings: SharedV3Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV3Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const minimaxTools: Array<MiniMaxFunctionTool> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
      });
    } else {
      minimaxTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: minimaxTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice?.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: minimaxTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: minimaxTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
        },
        toolWarnings,
      };
    default: {
      return {
        tools: minimaxTools,
        toolChoice: undefined,
        toolWarnings: [
          ...toolWarnings,
          {
            type: 'unsupported',
            feature: `tool choice type: ${type}`,
          },
        ],
      };
    }
  }
}
