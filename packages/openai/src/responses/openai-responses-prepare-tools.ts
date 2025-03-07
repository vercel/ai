import {
  JSONSchema7,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

export function prepareResponsesTools({
  mode,
  strict,
}: {
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  };
  strict: boolean;
}): {
  tools?: {
    type: 'function';
    name: string;
    description: string | undefined;
    parameters: JSONSchema7;
    strict?: boolean;
  }[];
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; name: string };
  toolWarnings: LanguageModelV1CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined, toolWarnings };
  }

  const toolChoice = mode.toolChoice;

  const openaiTools: Array<{
    type: 'function';
    name: string;
    description: string | undefined;
    parameters: JSONSchema7;
    strict: boolean | undefined;
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    } else {
      openaiTools.push({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: strict ? true : undefined,
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
          name: toolChoice.toolName,
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
