import {
  LanguageModelV3CallOptions,
  SharedV3Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { AlibabaChatToolChoice } from './alibaba-chat-prompt';

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
}): {
  tools:
    | Array<{
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
        };
      }>
    | undefined;
  toolChoice: AlibabaChatToolChoice | undefined;
  toolWarnings: SharedV3Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV3Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const alibabaTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
    };
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
      });
    } else {
      alibabaTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: alibabaTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
      return { tools: alibabaTools, toolChoice: type, toolWarnings };

    case 'required':
      return { tools: alibabaTools, toolChoice: 'required', toolWarnings };

    case 'tool':
      return {
        tools: alibabaTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
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
