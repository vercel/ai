import {
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import type { MistralToolChoice } from './mistral-chat-prompt';
import { createToolNameMapping } from '@ai-sdk/provider-utils';

type MistralTool =
  | { type: 'web_search' | 'web_search_premium' }
  | {
      type: 'function';
      function: {
        name: string;
        description: string | undefined;
        parameters: unknown;
        strict?: boolean;
      };
    };

export const mistralProviderToolNames = {
  'mistral.web_search': 'web_search',
  'mistral.web_search_premium': 'web_search_premium',
} as const;

export function prepareConversationTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools: Array<MistralTool> | undefined;
  toolChoice: MistralToolChoice | undefined;
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const mistralTools: Array<MistralTool> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      if (
        tool.id === 'mistral.web_search' ||
        tool.id === 'mistral.web_search_premium'
      ) {
        mistralTools.push({ type: mistralProviderToolNames[tool.id] });
        continue;
      }
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
      });
    } else {
      mistralTools.push({
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
    return { tools: mistralTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
      return { tools: mistralTools, toolChoice: type, toolWarnings };
    case 'required':
      return { tools: mistralTools, toolChoice: 'any', toolWarnings };

    // mistral does not support tool mode directly,
    // so we filter the tools and force the tool choice through 'any'
    case 'tool': {
      const toolName = createToolNameMapping({
        tools,
        providerToolNames: mistralProviderToolNames,
      }).toProviderToolName(toolChoice.toolName);
      return {
        tools: mistralTools.filter(tool =>
          tool.type === 'function'
            ? tool.function.name === toolName
            : tool.type === toolName,
        ),
        toolChoice: 'any',
        toolWarnings,
      };
    }
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
