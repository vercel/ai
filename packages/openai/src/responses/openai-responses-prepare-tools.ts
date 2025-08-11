import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { OpenAIResponsesTool } from './openai-responses-api-types';
import { fileSearchArgsSchema } from '../tool/file-search';
import { codeInterpreterArgsSchema } from '../tool/code-interpreter';
import { webSearchPreviewArgsSchema } from '../tool/web-search-preview';

export function prepareResponsesTools({
  tools,
  toolChoice,
  strictJsonSchema,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  strictJsonSchema: boolean;
}): {
  tools?: Array<OpenAIResponsesTool>;
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'file_search' }
    | { type: 'web_search_preview' }
    | { type: 'function'; name: string }
    | { type: 'code_interpreter' };
  toolWarnings: LanguageModelV2CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const openaiTools: Array<OpenAIResponsesTool> = [];

  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        openaiTools.push({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: strictJsonSchema,
        });
        break;
      case 'provider-defined': {
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
          case 'openai.code_interpreter': {
            const args = codeInterpreterArgsSchema.parse(tool.args);
            openaiTools.push({
              type: 'code_interpreter',
              container:
                args.container == null
                  ? { type: 'auto', file_ids: undefined }
                  : typeof args.container === 'string'
                    ? args.container
                    : { type: 'auto', file_ids: args.container.fileIds },
            });
            break;
          }
          default: {
            toolWarnings.push({ type: 'unsupported-tool', tool });
            break;
          }
        }
        break;
      }
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
        toolChoice:
          toolChoice.toolName === 'code_interpreter' ||
          toolChoice.toolName === 'file_search' ||
          toolChoice.toolName === 'web_search_preview'
            ? { type: toolChoice.toolName }
            : { type: 'function', name: toolChoice.toolName },
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
