import type {
  JSONArray,
  LanguageModelV4FunctionTool,
  LanguageModelV4Prompt,
  LanguageModelV4ProviderTool,
} from '@ai-sdk/provider';

export function hoistInlineToolChanges({
  prompt,
  tools,
}: {
  prompt: LanguageModelV4Prompt;
  tools: Array<Tool> | undefined;
}): { prompt: LanguageModelV4Prompt; tools: Array<Tool> | undefined } {
  const firstNonSystemIndex = prompt.findIndex(
    message => message.role !== 'system',
  );
  const isHoistable = (message: LanguageModelV4Prompt[number], index: number) =>
    firstNonSystemIndex !== -1 &&
    index > firstNonSystemIndex &&
    hasInlineToolChange(message);

  if (!prompt.some(isHoistable)) {
    return { prompt, tools };
  }

  const hoistedTools = [...(tools ?? [])];
  const indexByName = new Map<string, number>();
  hoistedTools.forEach((tool, index) => indexByName.set(tool.name, index));

  const hoist = (tool: Tool) => {
    const existingIndex = indexByName.get(tool.name);
    const existing =
      existingIndex == null ? undefined : hoistedTools[existingIndex];
    const hoisted =
      existing == null || isDeferred(existing) ? asDeferred(tool) : tool;

    if (existingIndex == null) {
      indexByName.set(tool.name, hoistedTools.length);
      hoistedTools.push(hoisted);
    } else {
      hoistedTools[existingIndex] = hoisted;
    }
  };

  const hoistedPrompt = prompt.map((message, index) => {
    if (!isHoistable(message, index)) {
      return message;
    }

    const toolChanges = getToolChanges(message).map(toolChange => {
      if (!isInlineToolChange(toolChange) || isComputerTool(toolChange.tool)) {
        return toolChange;
      }
      hoist(toolChange.tool);
      return { type: 'tool_addition', toolName: toolChange.tool.name };
    });

    return {
      ...message,
      providerOptions: {
        ...message.providerOptions,
        anthropic: { ...message.providerOptions?.anthropic, toolChanges },
      },
    };
  });

  return { prompt: hoistedPrompt, tools: hoistedTools };
}

type InlineToolChange = { type: 'tool_addition'; tool: Tool };

type Tool = LanguageModelV4FunctionTool | LanguageModelV4ProviderTool;

function asDeferred(tool: Tool): Tool {
  if (tool.type !== 'function') {
    return tool;
  }
  const {
    cacheControl: _cacheControl,
    cache_control: _cache_control,
    ...anthropicOptions
  } = tool.providerOptions?.anthropic ?? {};
  return {
    ...tool,
    providerOptions: {
      ...tool.providerOptions,
      anthropic: { ...anthropicOptions, deferLoading: true },
    },
  };
}

function getToolChanges(message: LanguageModelV4Prompt[number]): JSONArray {
  const toolChanges = message.providerOptions?.anthropic?.toolChanges;
  return Array.isArray(toolChanges) ? toolChanges : [];
}

function hasInlineToolChange(message: LanguageModelV4Prompt[number]): boolean {
  return (
    message.role === 'system' &&
    getToolChanges(message).some(isInlineToolChange)
  );
}

function isComputerTool(tool: Tool): boolean {
  return tool.type === 'provider' && tool.id.startsWith('anthropic.computer_');
}

function isDeferred(tool: Tool): boolean {
  return (
    tool.type === 'function' &&
    tool.providerOptions?.anthropic?.deferLoading === true
  );
}

function isInlineToolChange(
  toolChange: unknown,
): toolChange is InlineToolChange {
  if (typeof toolChange !== 'object' || toolChange == null) {
    return false;
  }
  const { type, tool } = toolChange as { type?: unknown; tool?: unknown };
  if (type !== 'tool_addition' || typeof tool !== 'object' || tool == null) {
    return false;
  }
  const { name, type: toolType } = tool as { name?: unknown; type?: unknown };
  return (
    typeof name === 'string' &&
    (toolType === 'function' || toolType === 'provider')
  );
}
