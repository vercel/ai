import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  OpenAIChatToolChoice,
  OpenAIChatFunctionTool,
} from './openai-chat-types';

export function prepareChatTools({
  tools,
  toolChoice,
  structuredOutputs,
  strictJsonSchema,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  structuredOutputs: boolean;
  strictJsonSchema: boolean;
}): {
  tools?: OpenAIChatFunctionTool[];
  toolChoice?: OpenAIChatToolChoice;
  toolWarnings: Array<LanguageModelV2CallWarning>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const openaiTools: OpenAIChatFunctionTool[] = [];

  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        openaiTools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            strict: structuredOutputs ? strictJsonSchema : undefined,
          },
        });
        break;
      default:
        toolWarnings.push({ type: 'unsupported-tool', tool });
        break;
    }
  }

  if (toolChoice == null) {
    return { tools: openaiTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: openaiTools,
        toolChoice: {
          type: 'function',
          function: {
            name: toolChoice.toolName,
          },
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
