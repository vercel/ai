import {
  LanguageModelV3CallOptions,
  SharedV3Warning,
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
  toolWarnings: SharedV3Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV3Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolConfig: undefined, toolWarnings };
  }

  // Check for mixed tool types and add warnings
  const hasFunctionTools = tools.some(tool => tool.type === 'function');
  const hasProviderDefinedTools = tools.some(
    tool => tool.type === 'provider-defined',
  );

  if (hasFunctionTools && hasProviderDefinedTools) {
    toolWarnings.push({
      type: 'unsupported',
      feature: `combination of function and provider-defined tools`,
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
          if (IsToolSupported(GOOGLE_SEARCH_UNSUPPORTED_MODELS, modelId)) {
            googleTools.push({ googleSearch: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `Google search grounding is not supported on the following models: ${getUnsupportedModelsString(GOOGLE_SEARCH_UNSUPPORTED_MODELS)}. Current model: ${modelId}`,
            });
          }
          break;
        case 'google.url_context':
          if (IsToolSupported(URL_CONTEXT_UNSUPPORTED_MODELS, modelId)) {
            googleTools.push({ urlContext: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `The URL context tool is not supported on the following models: ${getUnsupportedModelsString(URL_CONTEXT_UNSUPPORTED_MODELS)}. Current model: ${modelId}`,
            });
          }
          break;
        case 'google.code_execution':
          if (IsToolSupported(CODE_EXECUTION_UNSUPPORTED_MODELS, modelId)) {
            googleTools.push({ codeExecution: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `The code execution tool is not supported on the following models: ${getUnsupportedModelsString(CODE_EXECUTION_UNSUPPORTED_MODELS)}. Current model: ${modelId}`,
            });
          }
          break;
        case 'google.file_search':
          if (IsToolSupported(FILE_SEARCH_UNSUPPORTED_MODELS, modelId)) {
            googleTools.push({ fileSearch: { ...tool.args } });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
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
          toolWarnings.push({
            type: 'unsupported',
            feature: `provider-defined tool ${tool.id}`,
          });
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
        toolWarnings.push({
          type: 'unsupported',
          feature: `function tool ${tool.name}`,
        });
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
