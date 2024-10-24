import { LanguageModelV1, LanguageModelV1CallWarning } from '@ai-sdk/provider';
import {
  FunctionCallingMode,
  FunctionDeclaration,
  FunctionDeclarationSchema,
  Tool,
  ToolConfig,
} from '@google-cloud/vertexai';
import { convertJSONSchemaToOpenAPISchema } from './convert-json-schema-to-openapi-schema';

export function prepareTools({
  useSearchGrounding,
  mode,
}: {
  useSearchGrounding: boolean;
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  };
}): {
  tools: Tool[] | undefined;
  toolConfig: ToolConfig | undefined;
  toolWarnings: LanguageModelV1CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  const toolWarnings: LanguageModelV1CallWarning[] = [];

  const vertexTools: Tool[] = [];

  if (tools != null) {
    const functionDeclarations: FunctionDeclaration[] = [];

    for (const tool of tools) {
      if (tool.type === 'provider-defined') {
        toolWarnings.push({ type: 'unsupported-tool', tool });
      } else {
        functionDeclarations.push({
          name: tool.name,
          description: tool.description ?? '',
          parameters: convertJSONSchemaToOpenAPISchema(
            tool.parameters,
          ) as FunctionDeclarationSchema,
        });
      }
    }

    vertexTools.push({ functionDeclarations });
  }

  if (useSearchGrounding) {
    vertexTools.push({ googleSearchRetrieval: {} });
  }

  const finalTools = vertexTools.length > 0 ? vertexTools : undefined;

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return {
      tools: finalTools,
      toolConfig: undefined,
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.AUTO },
        },
        toolWarnings,
      };
    case 'none':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.NONE },
        },
        toolWarnings,
      };
    case 'required':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.ANY },
        },
        toolWarnings,
      };
    case 'tool':
      return {
        tools: finalTools,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames: [toolChoice.toolName],
          },
        },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}
