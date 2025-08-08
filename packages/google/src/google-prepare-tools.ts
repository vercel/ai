import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import { GoogleGenerativeAIModelId } from './google-generative-ai-options';

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
  toolWarnings: LanguageModelV2CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  const isGemini2 = modelId.includes('gemini-2');
  const supportsDynamicRetrieval =
    modelId.includes('gemini-1.5-flash') && !modelId.includes('-8b');

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
      type: 'unsupported-tool',
      tool: tools.find(tool => tool.type === 'function')!,
      details:
        'Cannot mix function tools with provider-defined tools in the same request. Please use either function tools or provider-defined tools, but not both.',
    });
  }

  if (hasProviderDefinedTools) {
    const googleTools: Record<string, any> = {};

    const providerDefinedTools = tools.filter(
      tool => tool.type === 'provider-defined',
    );
    providerDefinedTools.forEach(tool => {
      switch (tool.id) {
        case 'google.google_search':
          if (isGemini2) {
            googleTools.googleSearch = {};
          } else if (supportsDynamicRetrieval) {
            // For non-Gemini-2 models that don't support dynamic retrieval, use basic googleSearchRetrieval
            googleTools.googleSearchRetrieval = {
              dynamicRetrievalConfig: {
                mode: tool.args.mode as
                  | 'MODE_DYNAMIC'
                  | 'MODE_UNSPECIFIED'
                  | undefined,
                dynamicThreshold: tool.args.dynamicThreshold as
                  | number
                  | undefined,
              },
            };
          } else {
            googleTools.googleSearchRetrieval = {};
          }
          break;
        case 'google.url_context':
          if (isGemini2) {
            googleTools.urlContext = {};
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
          if (isGemini2) {
            googleTools.codeExecution = {};
          } else {
            toolWarnings.push({
              type: 'unsupported-tool',
              tool,
              details:
                'The code execution tools is not supported with other Gemini models than Gemini 2.',
            });
          }
          break;
        default:
          toolWarnings.push({ type: 'unsupported-tool', tool });
          break;
      }
    });

    return {
      tools: Object.keys(googleTools).length > 0 ? googleTools : undefined,
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
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
