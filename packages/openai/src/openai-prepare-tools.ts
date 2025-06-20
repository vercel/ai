import {
  JSONSchema7,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { fileSearchArgsSchema } from './tool/file-search';
import { webSearchPreviewArgsSchema } from './tool/web-search-preview';

export function prepareTools({
  tools,
  toolChoice,
  structuredOutputs,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  structuredOutputs: boolean;
}): {
  tools?: Array<
    | {
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: JSONSchema7;
          strict?: boolean;
        };
      }
    | {
        type: 'file_search';
        vector_store_ids?: string[];
        max_results?: number;
        search_type?: 'auto' | 'keyword' | 'semantic';
      }
    | {
        type: 'web_search_preview';
        search_context_size?: 'low' | 'medium' | 'high';
        user_location?: {
          type?: 'approximate';
          city?: string;
          region?: string;
          country?: string;
          timezone?: string;
        };
      }
  >;
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };

  toolWarnings: Array<LanguageModelV2CallWarning>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const openaiTools: Array<
    | {
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: JSONSchema7;
          strict: boolean | undefined;
        };
      }
    | {
        type: 'file_search';
        vector_store_ids?: string[];
        max_results?: number;
        search_type?: 'auto' | 'keyword' | 'semantic';
      }
    | {
        type: 'web_search_preview';
        search_context_size?: 'low' | 'medium' | 'high';
        user_location?: {
          type?: 'approximate';
          city?: string;
          region?: string;
          country?: string;
          timezone?: string;
        };
      }
  > = [];

  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        openaiTools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            strict: structuredOutputs ? true : undefined,
          },
        });
        break;
      case 'provider-defined-client':
        // OpenAI doesn't have client-side tools currently
        toolWarnings.push({ type: 'unsupported-tool', tool });
        break;
      case 'provider-defined-server':
        switch (tool.id) {
          case 'openai.file_search':
            const fileSearchArgs = fileSearchArgsSchema.parse(tool.args);
            openaiTools.push({
              type: 'file_search',
              vector_store_ids: fileSearchArgs.vectorStoreIds,
              max_results: fileSearchArgs.maxResults,
              search_type: fileSearchArgs.searchType,
            });
            break;
          case 'openai.web_search_preview':
            const webSearchArgs = webSearchPreviewArgsSchema.parse(tool.args);
            openaiTools.push({
              type: 'web_search_preview',
              search_context_size: webSearchArgs.searchContextSize,
              user_location: webSearchArgs.userLocation,
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
