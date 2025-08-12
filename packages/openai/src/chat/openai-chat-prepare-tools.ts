import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { fileSearchArgsSchema } from '../tool/file-search';
import { webSearchPreviewArgsSchema } from '../tool/web-search-preview';
import { OpenAIChatToolChoice, OpenAIChatTools } from './openai-chat-types';

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
  tools?: OpenAIChatTools;
  toolChoice?: OpenAIChatToolChoice;
  toolWarnings: Array<LanguageModelV2CallWarning>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const openaiTools: OpenAIChatTools = [];

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
      case 'provider-defined':
        switch (tool.id) {
          case 'openai.file_search': {
            const args = fileSearchArgsSchema.parse(tool.args);
            openaiTools.push({
              type: 'file_search',
              vector_store_ids: args.vectorStoreIds,
              max_num_results: args.maxNumResults,
              ranking_options: args.ranking
                ? { ranker: args.ranking.ranker }
                : undefined,
              filters: args.filters,
            });
            break;
          }
          case 'openai.web_search_preview': {
            const args = webSearchPreviewArgsSchema.parse(tool.args);
            openaiTools.push({
              type: 'web_search_preview',
              search_context_size: args.searchContextSize,
              user_location: args.userLocation,
            });
            break;
          }
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
