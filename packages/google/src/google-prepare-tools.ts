import {
  type LanguageModelV2CallOptions,
  type LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
<<<<<<< HEAD
import type { GoogleGenerativeAIModelId } from './google-generative-ai-options';
=======
import type { GoogleModelId } from './google-language-model-options';
import { getGoogleModelCapabilities } from './google-model-capabilities';
>>>>>>> f1266498a2 (feat: use forward-compatible capability defaults for unknown Google Gemini models (#17816))

export function prepareTools({
  tools,
  toolChoice,
  modelId,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  modelId: GoogleGenerativeAIModelId;
}): {
  tools:
    | Array<
        | {
            functionDeclarations: Array<{
              name: string;
              description: string;
              parameters: unknown;
            }>;
          }
        | Record<string, any>
      >
    | undefined;
  toolConfig:
    | undefined
    | {
        functionCallingConfig: {
          mode: 'AUTO' | 'NONE' | 'ANY' | 'VALIDATED';
          allowedFunctionNames?: string[];
        };
      };
  toolWarnings: LanguageModelV2CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

<<<<<<< HEAD
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
=======
  const { supportsGemini2Tools, supportsFileSearch, usesGemini3Features } =
    getGoogleModelCapabilities(modelId);
>>>>>>> f1266498a2 (feat: use forward-compatible capability defaults for unknown Google Gemini models (#17816))

  if (tools == null) {
    return { tools: undefined, toolConfig: undefined, toolWarnings };
  }

  // Check for mixed tool types and add warnings
  const hasFunctionTools = tools.some(tool => tool.type === 'function');
  const hasProviderDefinedTools = tools.some(
    tool => tool.type === 'provider-defined',
  );

<<<<<<< HEAD
  if (hasFunctionTools && hasProviderDefinedTools) {
    const functionTools = tools.filter(tool => tool.type === 'function');
=======
  if (hasFunctionTools && hasProviderTools && !usesGemini3Features) {
>>>>>>> f1266498a2 (feat: use forward-compatible capability defaults for unknown Google Gemini models (#17816))
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
          if (supportsGemini2Tools) {
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
          if (supportsGemini2Tools) {
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
          if (supportsGemini2Tools) {
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
          if (supportsGemini2Tools) {
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
          if (supportsGemini2Tools) {
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
          if (supportsGemini2Tools) {
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

<<<<<<< HEAD
=======
    if (hasFunctionTools && usesGemini3Features && googleTools.length > 0) {
      const functionDeclarations: Array<{
        name: string;
        description: string;
        parameters: unknown;
      }> = [];
      for (const tool of tools) {
        if (tool.type === 'function') {
          functionDeclarations.push({
            name: tool.name,
            description: tool.description ?? '',
            parameters: convertJSONSchemaToOpenAPISchema(tool.inputSchema),
          });
        }
      }

      const combinedToolConfig: {
        functionCallingConfig: {
          mode: 'VALIDATED' | 'ANY' | 'NONE';
          allowedFunctionNames?: string[];
        };
        includeServerSideToolInvocations?: true;
      } = {
        functionCallingConfig: { mode: 'VALIDATED' },
        ...(!isVertexProvider && {
          includeServerSideToolInvocations: true,
        }),
      };

      if (toolChoice != null) {
        switch (toolChoice.type) {
          case 'auto':
            break;
          case 'none':
            combinedToolConfig.functionCallingConfig = { mode: 'NONE' };
            break;
          case 'required':
            combinedToolConfig.functionCallingConfig = { mode: 'ANY' };
            break;
          case 'tool':
            combinedToolConfig.functionCallingConfig = {
              mode: 'ANY',
              allowedFunctionNames: [toolChoice.toolName],
            };
            break;
        }
      }

      return {
        tools: [...googleTools, { functionDeclarations }],
        toolConfig: combinedToolConfig,
        toolWarnings,
      };
    }

>>>>>>> f1266498a2 (feat: use forward-compatible capability defaults for unknown Google Gemini models (#17816))
    return {
      tools: googleTools.length > 0 ? googleTools : undefined,
      toolConfig: undefined,
      toolWarnings,
    };
  }

  const functionDeclarations = [];
  let hasStrictTools = false;
  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        functionDeclarations.push({
          name: tool.name,
          description: tool.description ?? '',
          parameters: convertJSONSchemaToOpenAPISchema(tool.inputSchema),
        });
        if ((tool as any).strict === true) {
          hasStrictTools = true;
        }
        break;
      default:
        toolWarnings.push({ type: 'unsupported-tool', tool });
        break;
    }
  }

  if (toolChoice == null) {
    return {
      tools: [{ functionDeclarations }],
      toolConfig: hasStrictTools
        ? { functionCallingConfig: { mode: 'VALIDATED' } }
        : undefined,
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: [{ functionDeclarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: hasStrictTools ? 'VALIDATED' : 'AUTO',
          },
        },
        toolWarnings,
      };
    case 'none':
      return {
        tools: [{ functionDeclarations }],
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        toolWarnings,
      };
    case 'required':
      return {
        tools: [{ functionDeclarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: hasStrictTools ? 'VALIDATED' : 'ANY',
          },
        },
        toolWarnings,
      };
    case 'tool':
      return {
        tools: [{ functionDeclarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: hasStrictTools ? 'VALIDATED' : 'ANY',
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
