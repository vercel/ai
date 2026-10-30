import {
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import type { GoogleModelId } from './google-language-model-options';
import { getModelCapabilities } from '@ai-sdk/provider-utils';
import { googleLanguageModelCatalog } from './google-model-catalog';

type FunctionTool = Extract<
  NonNullable<LanguageModelV4CallOptions['tools']>[number],
  { type: 'function' }
>;

type GoogleFunctionDeclaration = {
  name: string;
  description: string;
  parametersJsonSchema: unknown;
};

export function prepareTools({
  tools,
  toolChoice,
  modelId,
  isVertexProvider = false,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
  modelId: GoogleModelId;
  isVertexProvider?: boolean;
}): {
  tools:
    | Array<
        | {
            functionDeclarations: GoogleFunctionDeclaration[];
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
          streamFunctionCallArguments?: boolean;
        };
        includeServerSideToolInvocations?: boolean;
      };
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  const {
    providerTools: supportsProviderTools,
    fileSearch: supportsFileSearch,
    mixed: supportsMixedTools,
  } = getModelCapabilities(googleLanguageModelCatalog, modelId).capabilities
    .tools;

  if (tools == null) {
    return { tools: undefined, toolConfig: undefined, toolWarnings };
  }

  // Check for mixed tool types and add warnings
  const hasFunctionTools = tools.some(tool => tool.type === 'function');
  const hasProviderTools = tools.some(tool => tool.type === 'provider');

  if (hasFunctionTools && hasProviderTools && !supportsMixedTools) {
    toolWarnings.push({
      type: 'unsupported',
      feature: `combination of function and provider-defined tools`,
    });
  }

  if (hasProviderTools) {
    const googleTools: any[] = [];

    const ProviderTools = tools.filter(tool => tool.type === 'provider');
    ProviderTools.forEach(tool => {
      switch (tool.id) {
        case 'google.google_search':
          if (supportsProviderTools) {
            googleTools.push({ googleSearch: { ...tool.args } });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `${modelId} does not support this tool.`,
            });
          }
          break;
        case 'google.enterprise_web_search':
          if (supportsProviderTools) {
            googleTools.push({ enterpriseWebSearch: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `${modelId} does not support this tool.`,
            });
          }
          break;
        case 'google.url_context':
          if (supportsProviderTools) {
            googleTools.push({ urlContext: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `${modelId} does not support this tool.`,
            });
          }
          break;
        case 'google.code_execution':
          if (supportsProviderTools) {
            googleTools.push({ codeExecution: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `${modelId} does not support this tool.`,
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
              details: `${modelId} does not support this tool.`,
            });
          }
          break;
        case 'google.vertex_rag_store':
          if (supportsProviderTools) {
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
              details: `${modelId} does not support this tool.`,
            });
          }
          break;
        case 'google.google_maps':
          if (supportsProviderTools) {
            googleTools.push({ googleMaps: {} });
          } else {
            toolWarnings.push({
              type: 'unsupported',
              feature: `provider-defined tool ${tool.id}`,
              details: `${modelId} does not support this tool.`,
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

    if (hasFunctionTools && supportsMixedTools && googleTools.length > 0) {
      const functionDeclarations: GoogleFunctionDeclaration[] = [];
      for (const tool of tools) {
        if (tool.type === 'function') {
          functionDeclarations.push(prepareFunctionDeclaration(tool));
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
        functionDeclarations.push(prepareFunctionDeclaration(tool));
        if (tool.strict === true) {
          hasStrictTools = true;
        }
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
            mode: 'ANY',
          },
        },
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

function prepareFunctionDeclaration(
  tool: FunctionTool,
): GoogleFunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description ?? '',
    parametersJsonSchema: tool.inputSchema,
  };
}
