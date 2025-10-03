import {
  LanguageModelV3CallOptions,
  LanguageModelV3CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  getSupportedModelsString,
  isBrowserSearchSupportedModel,
} from './groq-browser-search-models';
import { GroqChatModelId } from './groq-chat-options';

export function prepareTools({
  tools,
  toolChoice,
  modelId,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
  modelId: GroqChatModelId;
}): {
  tools:
    | undefined
    | Array<
        | {
            type: 'function';
            function: {
              name: string;
              description: string | undefined;
              parameters: unknown;
            };
          }
        | {
            type: 'browser_search';
          }
      >;
  toolChoice:
    | { type: 'function'; function: { name: string } }
    | 'auto'
    | 'none'
    | 'required'
    | undefined;
  toolWarnings: LanguageModelV3CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV3CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const groqTools: Array<
    | {
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
        };
      }
    | {
        type: 'browser_search';
      }
  > = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      if (tool.id === 'groq.browser_search') {
        if (!isBrowserSearchSupportedModel(modelId)) {
          toolWarnings.push({
            type: 'unsupported-tool',
            tool,
            details: `Browser search is only supported on the following models: ${getSupportedModelsString()}. Current model: ${modelId}`,
          });
        } else {
          groqTools.push({
            type: 'browser_search',
          });
        }
      } else {
        toolWarnings.push({ type: 'unsupported-tool', tool });
      }
    } else {
      groqTools.push({
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
    return { tools: groqTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: groqTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: groqTools,
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
