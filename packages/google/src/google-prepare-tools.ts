import {
  LanguageModelV3CallOptions,
  LanguageModelV3CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { GoogleGenerativeAIModelId } from './google-generative-ai-options';

export function prepareTools({
  tools,
  toolChoice,
  modelId,
  functionCallingConfig,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
  modelId: GoogleGenerativeAIModelId;
  functionCallingConfig?: {
    mode?: 'AUTO' | 'NONE' | 'ANY';
    allowedFunctionNames?: string[];
  };
}): {
  tools:
    | {
        functionDeclarations: Array<{
          name: string;
          description: string;
          parameters: unknown;
        }>;
      }
    | Record<string, any>
    | undefined;
  toolConfig:
    | undefined
    | {
        functionCallingConfig: {
          mode: 'AUTO' | 'NONE' | 'ANY';
          allowedFunctionNames?: string[];
        };
      };
  toolWarnings: LanguageModelV3CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV3CallWarning[] = [];

  const isLatest = (
    [
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-pro-latest',
    ] as const satisfies GoogleGenerativeAIModelId[]
  ).some(id => id === modelId);
  const isGemini2orNewer =
    modelId.includes('gemini-2') || modelId.includes('gemini-3') || isLatest;
  const supportsDynamicRetrieval =
    modelId.includes('gemini-1.5-flash') && !modelId.includes('-8b');
  const supportsFileSearch = modelId.includes('gemini-2.5');

  if (tools == null) {
    return { tools: undefined, toolConfig: undefined, toolWarnings };
  }

  // Check for mixed tool types and add warnings
  const hasFunctionTools = tools.some(tool => tool.type === 'function');
  const hasProviderDefinedTools = tools.some(
    tool => tool.type === 'provider-defined',
  );

  if (hasFunctionTools && hasProviderDefinedTools) {
    const functionTools = tools.filter(tool => tool.type === 'function');
    toolWarnings.push({
      type: 'unsupported-tool',
      tool: tools.find(tool => tool.type === 'function')!,
      details: `Cannot mix function tools with provider-defined tools in the same request. Falling back to provider-defined tools only. The following function tools will be ignored: ${functionTools.map(t => t.name).join(', ')}. Please use either function tools or provider-defined tools, but not both.`,
    });
  }

  if (hasProviderDefinedTools) {
    const googleTools: any[] = [];

    const providerDefinedTools = tools.filter(
      tool => tool.type === 'provider-defined',
    );
    providerDefinedTools.forEach(tool => {
      switch (tool.id) {
        case 'google.google_search':
          if (isGemini2orNewer) {
            googleTools.push({ googleSearch: {} });
          } else if (supportsDynamicRetrieval) {
            // For non-Gemini-2 models that don't support dynamic retrieval, use basic googleSearchRetrieval
            googleTools.push({
              googleSearchRetrieval: {
                dynamicRetrievalConfig: {
                  mode: tool.args.mode as
                    | 'MODE_DYNAMIC'
                    | 'MODE_UNSPECIFIED'
                    | undefined,
                  dynamicThreshold: tool.args.dynamicThreshold as
                    | number
                    | undefined,
                },
              },
            });
          } else {
            googleTools.push({ googleSearchRetrieval: {} });
          }
          break;
        case 'google.url_context':
          if (isGemini2orNewer) {
            googleTools.push({ urlContext: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details:
                'The URL context tool is not supported with other Gemini models than Gemini 2.',
            });
          }
          break;
        case 'google.code_execution':
          if (isGemini2orNewer) {
            googleTools.push({ codeExecution: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details:
                'The code execution tools is not supported with other Gemini models than Gemini 2.',
            });
          }
          break;
        case 'google.file_search':
          if (supportsFileSearch) {
            googleTools.push({ fileSearch: { ...tool.args } });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details:
                'The file search tool is only supported with Gemini 2.5 models.',
            });
          }
          break;
        case 'google.vertex_rag_store':
          if (isGemini2orNewer) {
            googleTools.push({
              retrieval: {
                vertex_rag_store: {
                  rag_resources: {
                    rag_corpus: tool.args.ragCorpus,
                  },
                  similarity_top_k: tool.args.topK as number | undefined,
                },
              },
            });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details:
                'The RAG store tool is not supported with other Gemini models than Gemini 2.',
            });
          }
          break;
        default:
          toolWarnings.push({ type: 'unsupported-tool', tool });
          break;
      }
    });

    return {
      tools: googleTools.length > 0 ? googleTools : undefined,
      toolConfig: undefined,
      toolWarnings,
    };
  }

  const functionDeclarations = [];
  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        functionDeclarations.push({
          name: tool.name,
          description: tool.description ?? '',
          parameters: convertJSONSchemaToOpenAPISchema(tool.inputSchema),
        });
        break;
      default:
        toolWarnings.push({ type: 'unsupported-tool', tool });
        break;
    }
  }

  // When toolChoice is 'auto' or not specified, allow functionCallingConfig to take precedence
  // This ensures that provider options can override the default 'auto' behavior
  if (toolChoice == null || toolChoice.type === 'auto') {
    // If functionCallingConfig is provided via provider options, use it
    if (functionCallingConfig != null) {
      const mode = functionCallingConfig.mode ?? 'AUTO';
      const config: {
        mode: 'AUTO' | 'NONE' | 'ANY';
        allowedFunctionNames?: string[];
      } = {
        mode,
      };

      // allowedFunctionNames is only valid when mode is 'ANY'
      if (
        mode === 'ANY' &&
        functionCallingConfig.allowedFunctionNames != null &&
        functionCallingConfig.allowedFunctionNames.length > 0
      ) {
        config.allowedFunctionNames =
          functionCallingConfig.allowedFunctionNames;
      }

      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: config },
        toolWarnings,
      };
    }

    // If toolChoice is explicitly 'auto', return the AUTO config
    if (toolChoice?.type === 'auto') {
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        toolWarnings,
      };
    }

    // Otherwise, return undefined toolConfig (default behavior)
    return {
      tools: { functionDeclarations },
      toolConfig: undefined,
      toolWarnings,
    };
  }

  // At this point, toolChoice is not null and not 'auto', so handle other explicit choices
  const type = toolChoice.type;

  switch (type) {
    case 'none':
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        toolWarnings,
      };
    case 'required':
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
        toolWarnings,
      };
    case 'tool':
      return {
        tools: { functionDeclarations },
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [toolChoice.toolName],
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
