import {
  LanguageModelV3CallOptions,
  LanguageModelV3CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { GoogleGenerativeAIModelId } from './google-generative-ai-options';
import {
  CODE_EXECUTION_UNSUPPORTED_MODELS,
  FILE_SEARCH_UNSUPPORTED_MODELS,
  GOOGLE_SEARCH_UNSUPPORTED_MODELS,
  URL_CONTEXT_UNSUPPORTED_MODELS,
  getUnsupportedModelsString,
  IsToolSupported,
} from './gemini-tool-capabilities';

export function prepareTools({
  tools,
  toolChoice,
  modelId,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
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
          mode: 'AUTO' | 'NONE' | 'ANY';
          allowedFunctionNames?: string[];
        };
      };
  toolWarnings: LanguageModelV3CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV3CallWarning[] = [];

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
          // <<<<<<< HEAD
          if (IsToolSupported(GOOGLE_SEARCH_UNSUPPORTED_MODELS, modelId)) {
            // =======
            //           if (isGemini2orNewer) {
            // >>>>>>> origin/main
            googleTools.push({ googleSearch: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details: `Google search grounding is not supported on the following models: ${getUnsupportedModelsString(GOOGLE_SEARCH_UNSUPPORTED_MODELS)}. Current model: ${modelId}`,
            });
          }
          break;
        case 'google.url_context':
          // <<<<<<< HEAD
          if (IsToolSupported(URL_CONTEXT_UNSUPPORTED_MODELS, modelId)) {
            // =======
            //           if (isGemini2orNewer) {
            // >>>>>>> origin/main
            googleTools.push({ urlContext: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details: `The URL context tool is not supported on the following models: ${getUnsupportedModelsString(URL_CONTEXT_UNSUPPORTED_MODELS)}. Current model: ${modelId}`,
            });
          }
          break;
        case 'google.code_execution':
          // <<<<<<< HEAD
          if (IsToolSupported(CODE_EXECUTION_UNSUPPORTED_MODELS, modelId)) {
            // =======
            //           if (isGemini2orNewer) {
            // >>>>>>> origin/main
            googleTools.push({ codeExecution: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details: `The code execution tool is not supported on the following models: ${getUnsupportedModelsString(CODE_EXECUTION_UNSUPPORTED_MODELS)}. Current model: ${modelId}`,
            });
          }
          break;
        case 'google.file_search':
          if (IsToolSupported(FILE_SEARCH_UNSUPPORTED_MODELS, modelId)) {
            googleTools.push({ fileSearch: { ...tool.args } });
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details: `The file search tool is not supported on the following models: ${getUnsupportedModelsString(FILE_SEARCH_UNSUPPORTED_MODELS)}. Current model: ${modelId}`,
            });
          }
          break;
        case 'google.vertex_rag_store':
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

  if (toolChoice == null) {
    return {
      tools: [{ functionDeclarations }],
      toolConfig: undefined,
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: [{ functionDeclarations }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
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
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
        toolWarnings,
      };
    case 'tool':
      return {
        tools: [{ functionDeclarations }],
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
