import {
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import type {
  DeepSeekFunctionTool,
  DeepSeekToolChoice,
} from './deepseek-chat-api-types';

export function prepareTools({
  tools,
  toolChoice,
  supportsStrictToolCalls,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
  supportsStrictToolCalls?: boolean;
}): {
  tools: undefined | Array<DeepSeekFunctionTool>;
  toolChoice: DeepSeekToolChoice;
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const functionTools = tools.filter(tool => tool.type === 'function');
  const hasStrictTool = functionTools.some(tool => tool.strict === true);

  if (hasStrictTool && supportsStrictToolCalls === false) {
    throw new UnsupportedFunctionalityError({
      functionality: 'DeepSeek strict tool calls',
      message:
        'DeepSeek strict tool calls require a beta base URL ending in `/beta`.',
    });
  }

  if (
    hasStrictTool &&
    supportsStrictToolCalls === true &&
    functionTools.some(tool => tool.strict !== true)
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: 'mixed DeepSeek strict and non-strict tool calls',
      message:
        'DeepSeek strict mode requires every function tool in the request to set `strict: true`.',
    });
  }

  const deepseekTools: Array<DeepSeekFunctionTool> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
      });
    } else {
      deepseekTools.push({
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
    return { tools: deepseekTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice?.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: deepseekTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: deepseekTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
        },
        toolWarnings,
      };
    default: {
      return {
        tools: deepseekTools,
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
