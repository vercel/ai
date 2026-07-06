import {
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import type { MistralToolChoice } from './mistral-chat-prompt';

type MistralFunctionTool = {
  type: 'function';
  function: {
    name: string;
    description: string | undefined;
    parameters: unknown;
    strict?: boolean;
  };
};

type MistralBuiltinTool =
  | { type: 'web_search' }
  | { type: 'web_search_premium' };

type MistralTool = MistralFunctionTool | MistralBuiltinTool;

export function prepareTools({
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
    case 'tool':
      return {
        tools: mistralTools.filter(
          tool =>
            tool.type === 'function' &&
            tool.function.name === toolChoice.toolName,
        ),
        toolChoice: 'any',
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
