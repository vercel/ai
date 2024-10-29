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

    case 'tool':
      // Cohere does not support tool mode directly, so we filter the tools and
      // force the tool choice through 'any'.
      //
      // TODO(shaper): `any` is not documented at
      // https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling#tool-choice
      // Perhaps it's referring to the option in a particular other provider's
      // API? Consider whether we should treat this as unsupported functionality
      // instead.
      return {
        tools: cohereTools.filter(
          tool => tool.function.name === toolChoice.toolName,
        ),
        tool_choice: 'any',
        toolWarnings,
      };

    case 'required':
      // Cohere does not support 'required' tool choice.
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
