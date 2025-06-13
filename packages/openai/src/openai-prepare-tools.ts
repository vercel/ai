import {
  JSONSchema7,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

export function prepareTools({
  tools,
  toolChoice,
  structuredOutputs,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  structuredOutputs: boolean;
}): {
  tools?: {
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: JSONSchema7;
      strict?: boolean;
    };
  }[];
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };

  toolWarnings: Array<LanguageModelV2CallWarning>;
  serverTools: Array<{
    name: string;
    id: string;
    args: Record<string, unknown>;
  }>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];
  const serverTools: Array<{
    name: string;
    id: string;
    args: Record<string, unknown>;
  }> = [];

  if (tools == null) {
    return {
      tools: undefined,
      toolChoice: undefined,
      toolWarnings,
      serverTools,
    };
  }

  const openaiTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: JSONSchema7;
      strict: boolean | undefined;
    };
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      // Handle OpenAI server-side tools
      switch (tool.id) {
        case 'openai.web_search_preview':
        case 'openai.code_interpreter':
        case 'openai.file_search':
          serverTools.push({
            name: tool.name,
            id: tool.id,
            args: tool.args,
          });
          break;
        default:
          toolWarnings.push({ type: 'unsupported-tool', tool });
          break;
      }
    } else {
      openaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: structuredOutputs ? true : undefined,
        },
      });
    }
  }

  if (toolChoice == null) {
    return {
      tools: openaiTools,
      toolChoice: undefined,
      toolWarnings,
      serverTools,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return {
        tools: openaiTools,
        toolChoice: type,
        toolWarnings,
        serverTools,
      };
    case 'tool':
      return {
        tools: openaiTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
        },
        toolWarnings,
        serverTools,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
