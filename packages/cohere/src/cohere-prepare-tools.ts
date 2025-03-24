import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

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
  toolChoice: 'NONE' | 'REQUIRED' | undefined;
  toolWarnings: LanguageModelV1CallWarning[];
} {
  const tools = mode.tools?.length ? mode.tools : undefined;
  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
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
    return { tools: cohereTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return { tools: cohereTools, toolChoice: undefined, toolWarnings };

    case 'none':
      return { tools: cohereTools, toolChoice: 'NONE', toolWarnings };

    case 'required':
      return { tools: cohereTools, toolChoice: 'REQUIRED', toolWarnings };

    case 'tool':
      return {
        tools: cohereTools.filter(
          tool => tool.function.name === toolChoice.toolName,
        ),
        toolChoice: 'REQUIRED',
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
