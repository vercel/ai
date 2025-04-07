import {
  JSONSchema7,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

export function prepareTools({
  tools,
  toolChoice,
  useLegacyFunctionCalling = false,
  structuredOutputs,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  useLegacyFunctionCalling: boolean | undefined;
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

  // legacy support
  functions?: {
    name: string;
    description: string | undefined;
    parameters: JSONSchema7;
  }[];
  function_call?: { name: string };
  toolWarnings: Array<LanguageModelV2CallWarning>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  if (useLegacyFunctionCalling) {
    const openaiFunctions: Array<{
      name: string;
      description: string | undefined;
      parameters: JSONSchema7;
    }> = [];

    for (const tool of tools) {
      if (tool.type === 'provider-defined') {
        toolWarnings.push({ type: 'unsupported-tool', tool });
      } else {
        openaiFunctions.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        });
      }
    }

    if (toolChoice == null) {
      return {
        functions: openaiFunctions,
        function_call: undefined,
        toolWarnings,
      };
    }

    const type = toolChoice.type;

    switch (type) {
      case 'auto':
      case 'none':
      case undefined:
        return {
          functions: openaiFunctions,
          function_call: undefined,
          toolWarnings,
        };
      case 'required':
        throw new UnsupportedFunctionalityError({
          functionality: 'useLegacyFunctionCalling and toolChoice: required',
        });
      default:
        return {
          functions: openaiFunctions,
          function_call: { name: toolChoice.toolName },
          toolWarnings,
        };
    }
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
      toolWarnings.push({ type: 'unsupported-tool', tool });
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
    return { tools: openaiTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: openaiTools,
        toolChoice: {
          type: 'function',
          function: {
            name: toolChoice.toolName,
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
