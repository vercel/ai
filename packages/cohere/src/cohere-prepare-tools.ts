import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

// For reference: https://docs.cohere.com/docs/parameter-types-in-tool-use
export function prepareTools(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
): {
  tools:
    | Array<{
        type: 'function';
        function: {
          name: string | undefined;
          description: string | undefined;
          parameters: unknown;
        };
      }>
    | undefined;
  tool_choice:
    | { type: 'function'; function: { name: string } }
    | 'auto'
    | 'none'
    | 'any'
    | undefined;
  toolWarnings: LanguageModelV1CallWarning[];
} {
  const tools = mode.tools?.length ? mode.tools : undefined;
  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined, toolWarnings };
  }

  const cohereTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
    };
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    } else {
      cohereTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      });
    }
  }

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return { tools: cohereTools, tool_choice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return { tools: cohereTools, tool_choice: type, toolWarnings };

    case 'none':
      // Cohere does not support 'none' tool choice, so we remove the tools.
      return { tools: undefined, tool_choice: 'any', toolWarnings };

    case 'required':
    case 'tool':
      // Cohere does not support forcing tool calls
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${type}`,
      });

    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}

/*
  Remove `additionalProperties` and `$schema` from the `parameters` object of each tool.
  Though these are part of JSON schema, Cohere chokes if we include them in the request.
  */
// TODO(shaper): Look at defining a type to simplify the params here and a couple of other places.
function removeJsonSchemaExtras(
  tools: Array<{
    type: 'function';
    function: {
      name: string | undefined;
      description: string | undefined;
      parameters: unknown;
    };
  }>,
) {
  return tools.map(tool => {
    if (
      tool.type === 'function' &&
      tool.function.parameters &&
      typeof tool.function.parameters === 'object'
    ) {
      const { additionalProperties, $schema, ...restParameters } = tool.function
        .parameters as Record<string, unknown>;
      return {
        ...tool,
        function: {
          ...tool.function,
          parameters: restParameters,
        },
      };
    }
    return tool;
  });
}
