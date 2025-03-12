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

  const isGemini2 = modelId.includes('gemini-2');
  const supportsDynamicRetrieval =
    modelId.includes('gemini-1.5-flash') && !modelId.includes('-8b');

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
