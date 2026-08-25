import {
<<<<<<< HEAD
  type LanguageModelV2CallOptions,
  type LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
=======
  UnsupportedFunctionalityError,
  type LanguageModelV3CallOptions,
  type SharedV3Warning,
>>>>>>> 7d45c74e32 (Backport: fix(provider/deepseek): guard strict tool calls (#19461))
} from '@ai-sdk/provider';

export function prepareTools({
  tools,
  toolChoice,
  supportsStrictToolCalls,
}: {
<<<<<<< HEAD
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
=======
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
  supportsStrictToolCalls?: boolean;
>>>>>>> 7d45c74e32 (Backport: fix(provider/deepseek): guard strict tool calls (#19461))
}): {
  tools:
    | undefined
    | Array<{
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
        };
      }>;
  toolChoice:
    | { type: 'function'; function: { name: string } }
    | 'auto'
    | 'none'
    | 'required'
    | undefined;
  toolWarnings: LanguageModelV2CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

<<<<<<< HEAD
  const deepseekTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
    };
  }> = [];
=======
  const functionTools = tools.filter(tool => tool.type === 'function');
  const hasStrictTool = functionTools.some(tool => tool.strict === true);

  if (hasStrictTool && supportsStrictToolCalls === false) {
    throw new UnsupportedFunctionalityError({
      functionality: 'DeepSeek strict tool calls',
      message:
        'DeepSeek strict tool calls require a beta base URL ending in `/beta`.',
    });
  }

  if (
    hasStrictTool &&
    supportsStrictToolCalls === true &&
    functionTools.some(tool => tool.strict !== true)
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: 'mixed DeepSeek strict and non-strict tool calls',
      message:
        'DeepSeek strict mode requires every function tool in the request to set `strict: true`.',
    });
  }

  const deepseekTools: Array<DeepSeekFunctionTool> = [];
>>>>>>> 7d45c74e32 (Backport: fix(provider/deepseek): guard strict tool calls (#19461))

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({
        type: 'unsupported-tool',
        tool,
      });
    } else {
      deepseekTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: deepseekTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: deepseekTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: deepseekTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
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
