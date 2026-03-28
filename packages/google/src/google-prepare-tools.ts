import {
  LanguageModelV4CallOptions,
  SharedV4Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { GoogleGenerativeAIModelId } from './google-generative-ai-options';

export function prepareTools({
  tools,
  toolChoice,
  modelId,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
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
        functionCallingConfig?: {
          mode: 'AUTO' | 'NONE' | 'ANY' | 'VALIDATED';
          allowedFunctionNames?: string[];
        };
        includeServerSideToolInvocations?: boolean;
      };
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

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
  const supportsToolCombination = modelId.includes('gemini-3');

  if (tools == null) {
    return { tools: undefined, toolConfig: undefined, toolWarnings };
  }

  const hasFunctionTools = tools.some(tool => tool.type === 'function');
  const hasProviderTools = tools.some(tool => tool.type === 'provider');
  const hasMixedTools = hasFunctionTools && hasProviderTools;

  if (hasMixedTools && !supportsToolCombination) {
    throw new UnsupportedFunctionalityError({
      functionality:
        'Gemini built-in tool and function combinations require a Gemini 3 model',
    });
  }

  const googleTools: any[] = [];

  const providerTools = tools.filter(tool => tool.type === 'provider');
  providerTools.forEach(tool => {
    switch (tool.id) {
      case 'google.google_search':
        if (isGemini2orNewer) {
          googleTools.push({ googleSearch: { ...tool.args } });
        } else {
          toolWarnings.push({
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
            details: 'Google Search requires Gemini 2.0 or newer.',
          });
        }
        break;
      case 'google.enterprise_web_search':
        if (isGemini2orNewer) {
          googleTools.push({ enterpriseWebSearch: {} });
        } else {
          toolWarnings.push({
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
            details: 'Enterprise Web Search requires Gemini 2.0 or newer.',
          });
        }
        break;
      case 'google.url_context':
        if (isGemini2orNewer) {
          googleTools.push({ urlContext: {} });
        } else {
          toolWarnings.push({
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
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
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
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
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
            details:
              'The file search tool is only supported with Gemini 2.5 models and Gemini 3 models.',
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
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
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
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
            details:
              'The Google Maps grounding tool is not supported with Gemini models other than Gemini 2 or newer.',
          });
        }
        break;
      default:
        toolWarnings.push({
          type: 'unsupported',
          feature: `provider-defined tool ${tool.id}`,
        });
        break;
    }
  });

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
        if (tool.strict === true) {
          hasStrictTools = true;
        }
        break;
      case 'provider':
        break;
      default:
        toolWarnings.push({
          type: 'unsupported',
          feature: `function tool ${tool.name}`,
        });
        break;
    }
  }

  const combinedTools = [
    ...(functionDeclarations.length > 0 ? [{ functionDeclarations }] : []),
    ...googleTools,
  ];
  const comboMode = hasMixedTools && supportsToolCombination;

  const functionCallingConfig =
    functionDeclarations.length === 0
      ? undefined
      : resolveFunctionCallingConfig({
          toolChoice,
          hasStrictTools,
          comboMode,
        });

  const toolConfig =
    functionCallingConfig != null || comboMode
      ? {
          ...(functionCallingConfig != null ? { functionCallingConfig } : {}),
          ...(comboMode ? { includeServerSideToolInvocations: true } : {}),
        }
      : undefined;

  return {
    tools: combinedTools.length > 0 ? combinedTools : undefined,
    toolConfig,
    toolWarnings,
  };
}

function resolveFunctionCallingConfig({
  toolChoice,
  hasStrictTools,
  comboMode,
}: {
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
  hasStrictTools: boolean;
  comboMode: boolean;
}):
  | {
      mode: 'AUTO' | 'NONE' | 'ANY' | 'VALIDATED';
      allowedFunctionNames?: string[];
    }
  | undefined {
  if (toolChoice == null) {
    return hasStrictTools || comboMode ? { mode: 'VALIDATED' } : undefined;
  }

  const validatedMode = (allowedFunctionNames?: string[]) => ({
    mode: 'VALIDATED' as const,
    ...(allowedFunctionNames != null ? { allowedFunctionNames } : {}),
  });

  switch (toolChoice.type) {
    case 'auto':
      return comboMode
        ? validatedMode()
        : { mode: hasStrictTools ? 'VALIDATED' : 'AUTO' };
    case 'none':
      return { mode: 'NONE' };
    case 'required':
      return comboMode
        ? validatedMode()
        : { mode: hasStrictTools ? 'VALIDATED' : 'ANY' };
    case 'tool':
      return comboMode
        ? validatedMode([toolChoice.toolName])
        : {
            mode: hasStrictTools ? 'VALIDATED' : 'ANY',
            allowedFunctionNames: [toolChoice.toolName],
          };
    default: {
      const _exhaustiveCheck: never = toolChoice.type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
