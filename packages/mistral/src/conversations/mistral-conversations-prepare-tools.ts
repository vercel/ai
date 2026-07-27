import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';

export type MistralConversationTool =
  | {
      type: 'function';
      function: {
        name: string;
        description: string | undefined;
        parameters: unknown;
        strict?: boolean;
      };
    }
  | { type: 'web_search' }
  | { type: 'web_search_premium' };

export function prepareConversationTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools: MistralConversationTool[] | undefined;
  toolChoice: 'auto' | 'none' | 'required' | undefined;
  toolWarnings: SharedV4Warning[];
} {
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const mistralTools: MistralConversationTool[] = [];

  for (const tool of tools) {
    if (tool.type === 'function') {
      mistralTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
      });
      continue;
    }

    switch (tool.id) {
      case 'mistral.web_search':
        mistralTools.push({ type: 'web_search' });
        break;
      case 'mistral.web_search_premium':
        mistralTools.push({ type: 'web_search_premium' });
        break;
      default:
        toolWarnings.push({
          type: 'unsupported',
          feature: `provider-defined tool ${tool.id}`,
        });
    }
  }

  if (toolChoice == null) {
    return { tools: mistralTools, toolChoice: undefined, toolWarnings };
  }

  const hasBuiltInTool = mistralTools.some(tool => tool.type !== 'function');

  switch (toolChoice.type) {
    case 'auto':
    case 'none':
      return {
        tools: mistralTools,
        toolChoice: toolChoice.type,
        toolWarnings,
      };

    case 'required':
      if (hasBuiltInTool) {
        toolWarnings.push({
          type: 'unsupported',
          feature: 'required tool choice with Mistral built-in tools',
          details:
            "Mistral's Conversations API does not allow tool_choice 'required' when built-in tools are present.",
        });
        return { tools: mistralTools, toolChoice: undefined, toolWarnings };
      }

      return { tools: mistralTools, toolChoice: 'required', toolWarnings };

    case 'tool': {
      const selectedTools = mistralTools.filter(
        tool =>
          (tool.type === 'function'
            ? tool.function.name
            : tool.type === 'web_search'
              ? 'web_search'
              : 'web_search_premium') === toolChoice.toolName,
      );
      const selectedBuiltInTool = selectedTools.some(
        tool => tool.type !== 'function',
      );

      if (selectedBuiltInTool) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `forcing Mistral built-in tool ${toolChoice.toolName}`,
          details:
            "Mistral's Conversations API does not support forcing a built-in tool.",
        });
        return {
          tools: selectedTools,
          toolChoice: undefined,
          toolWarnings,
        };
      }

      return {
        tools: selectedTools,
        toolChoice: 'required',
        toolWarnings,
      };
    }
  }
}
