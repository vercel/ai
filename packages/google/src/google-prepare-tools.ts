import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import {
  DynamicRetrievalConfig,
  GoogleGenerativeAIModelId,
} from './google-generative-ai-settings';

export function prepareTools(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
  useSearchGrounding: boolean,
  dynamicRetrievalConfig: DynamicRetrievalConfig | undefined,
  modelId: GoogleGenerativeAIModelId,
): {
  tools:
    | undefined
    | {
        functionDeclarations: Array<{
          name: string;
          description: string | undefined;
          parameters: unknown;
        }>;
      }
    | {
        googleSearchRetrieval:
          | Record<string, never>
          | { dynamicRetrievalConfig: DynamicRetrievalConfig };
      }
    | { googleSearch: Record<string, never> };
  toolConfig:
    | undefined
    | {
        functionCallingConfig: {
          mode: 'AUTO' | 'NONE' | 'ANY';
          allowedFunctionNames?: string[];
        };
      };
  toolWarnings: LanguageModelV1CallWarning[];
} {
  const tools = mode.tools?.length ? mode.tools : undefined;
  const toolWarnings: LanguageModelV1CallWarning[] = [];

<<<<<<< HEAD
  const isGemini2 = modelId.includes('gemini-2');
  const supportsDynamicRetrieval =
    modelId.includes('gemini-1.5-flash') && !modelId.includes('-8b');
=======
  const toolWarnings: LanguageModelV2CallWarning[] = [];

  const isLatest = (
    [
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-pro-latest',
    ] as const satisfies GoogleGenerativeAIModelId[]
  ).some(id => id === modelId);
  const isGemini2orNewer =
    modelId.includes('gemini-2') ||
    modelId.includes('gemini-3') ||
    modelId.includes('nano-banana') ||
    isLatest;
  const supportsFileSearch =
    modelId.includes('gemini-2.5') || modelId.includes('gemini-3');

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
            googleTools.push({ googleSearch: { ...tool.args } });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details: 'Google Search requires Gemini 2.0 or newer.',
            });
          }
          break;
        case 'google.enterprise_web_search':
          if (isGemini2orNewer) {
            googleTools.push({ enterpriseWebSearch: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details: 'Enterprise Web Search requires Gemini 2.0 or newer.',
            });
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
        case 'google.google_maps':
          if (isGemini2orNewer) {
            googleTools.push({ googleMaps: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details:
                'The Google Maps grounding tool is not supported with Gemini models other than Gemini 2 or newer.',
            });
          }
          break;
        default:
          toolWarnings.push({ type: 'unsupported-tool', tool });
          break;
      }
    });
>>>>>>> 4dda2a363 (Backport: feat(google): add support for image search, replace obsolete google_search_retrieval implementation (#13070))

  if (useSearchGrounding) {
    return {
      tools: isGemini2
        ? { googleSearch: {} }
        : {
            googleSearchRetrieval:
              !supportsDynamicRetrieval || !dynamicRetrievalConfig
                ? {}
                : { dynamicRetrievalConfig },
          },
      toolConfig: undefined,
      toolWarnings,
    };
  }

  if (tools == null) {
    return { tools: undefined, toolConfig: undefined, toolWarnings };
  }

  const functionDeclarations = [];
  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    } else {
      functionDeclarations.push({
        name: tool.name,
        description: tool.description ?? '',
        parameters: convertJSONSchemaToOpenAPISchema(tool.parameters),
      });
    }
  }

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return {
      tools: { functionDeclarations },
      toolConfig: undefined,
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        toolWarnings,
      };
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
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
