import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { OpenAIResponsesTool } from './openai-responses-api-types';

export function prepareResponsesTools({
  mode,
  strict,
}: {
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  };
  strict: boolean;
}): {
  tools?: Array<OpenAIResponsesTool>;
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'web_search_preview' }
    | { type: 'function'; name: string };
  toolWarnings: LanguageModelV1CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined, toolWarnings };
  }

  const toolChoice = mode.toolChoice;

  const openaiTools: Array<OpenAIResponsesTool> = [];

  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        openaiTools.push({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: strict ? true : undefined,
        });
        break;
      case 'provider-defined':
        switch (tool.id) {
          case 'openai.web_search_preview':
            openaiTools.push({
              type: 'web_search_preview',
              search_context_size: tool.args.searchContextSize as
                | 'low'
                | 'medium'
                | 'high',
              user_location: tool.args.userLocation as {
                type: 'approximate';
                city: string;
                region: string;
              },
            });
            break;
          case 'openai.file_search':
            openaiTools.push({
              type: 'file_search',
              vector_store_ids: tool.args.vectorStoreIds as string[],
            });
            break;
          default:
            toolWarnings.push({ type: 'unsupported-tool', tool });
            break;
        }
        break;
      default:
        toolWarnings.push({ type: 'unsupported-tool', tool });
        break;
    }
  }

  if (toolChoice == null) {
    return { tools: openaiTools, tool_choice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiTools, tool_choice: type, toolWarnings };
    case 'tool': {
      if (toolChoice.toolName === 'web_search_preview') {
        return {
          tools: openaiTools,
          tool_choice: {
            type: 'web_search_preview',
          },
          toolWarnings,
        };
      }
      return {
        tools: openaiTools,
        tool_choice: {
          type: 'function',
          name: toolChoice.toolName,
        },
        toolWarnings,
      };
    }
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
