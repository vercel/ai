import {
  JSONSchema7,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

export function prepareTools({
  mode,
  useLegacyFunctionCalling = false,
  structuredOutputs,
}: {
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  };
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
  tool_choice?:
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

  toolWarnings: LanguageModelV1CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined, toolWarnings };
  }

  const toolChoice = mode.toolChoice;

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
    return { tools: openaiTools, tool_choice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiTools, tool_choice: type, toolWarnings };
    case 'tool':
      return {
        tools: openaiTools,
        tool_choice: {
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
