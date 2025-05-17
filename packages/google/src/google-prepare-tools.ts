import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';
import {
  DynamicRetrievalConfig,
  GoogleGenerativeAIModelId,
} from './google-generative-ai-options';

export function prepareTools({
  tools,
  toolChoice,
  useSearchGrounding,
  dynamicRetrievalConfig,
  modelId,
  useCodeExecution,
  provider,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  useSearchGrounding: boolean;
  dynamicRetrievalConfig: DynamicRetrievalConfig | undefined;
  modelId: GoogleGenerativeAIModelId;
  useCodeExecution: boolean;
  provider: string;
}): {
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
    | {
        googleSearch: Record<string, never>;
        codeExecution: Record<string, never>;
      }
    | { googleSearch: Record<string, never> }
    | { codeExecution: Record<string, never> };
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

  if ((useSearchGrounding || useCodeExecution) && tools) {
    throw new UnsupportedFunctionalityError({
      functionality:
        'Provider-defined tools (useSearchGrounding or useCodeExecution) ' +
        'cannot be used in combination with user-defined tools. ' +
        'Please disable either the provider tools or your custom tools.',
    });
  }

  // Ensure mutual exclusivity of provider-defined tools
  if (useSearchGrounding && useCodeExecution) {
    if (provider !== 'google.generative-ai') {
      throw new UnsupportedFunctionalityError({
        functionality:
          'useSearchGrounding and useCodeExecution only be enabled simultaneously with the Google Generative AI provider.',
      });
    }
    if (!isGemini2) {
      throw new UnsupportedFunctionalityError({
        functionality:
          'useSearchGrounding cannot be used with useCodeExecution in Gemini <2 models.',
      });
    }
    return {
      tools: { codeExecution: {}, googleSearch: {} },
      toolConfig: undefined,
      toolWarnings,
    };
  }

  if (useCodeExecution) {
    // Add model compatibility check for code execution if necessary
    // For example, if only specific models support it:
    if (!isGemini2) {
      // Replace with actual model check for code execution
      throw new UnsupportedFunctionalityError({
        functionality: `Code Execution is not supported for model ${modelId}. It requires a Gemini 2 or compatible model.`,
      });
    }
    return {
      tools: { codeExecution: {} },
      toolConfig: undefined,
      toolWarnings,
    };
  }

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
