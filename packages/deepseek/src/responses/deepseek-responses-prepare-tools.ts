import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import type {
  DeepSeekResponsesTool,
  DeepSeekResponsesToolChoice,
} from './deepseek-responses-api';

export function prepareResponsesTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools: Array<DeepSeekResponsesTool> | undefined;
  toolChoice: DeepSeekResponsesToolChoice | undefined;
  toolWarnings: Array<SharedV4Warning>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: Array<SharedV4Warning> = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const deepseekTools: Array<DeepSeekResponsesTool> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
      });
      continue;
    }

    deepseekTools.push({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      ...(tool.strict != null && { strict: tool.strict }),
    });
  }

  if (toolChoice == null) {
    return { tools: deepseekTools, toolChoice: undefined, toolWarnings };
  }

  switch (toolChoice.type) {
    case 'auto':
    case 'none':
    case 'required':
      return {
        tools: deepseekTools,
        toolChoice: toolChoice.type,
        toolWarnings,
      };
    case 'tool':
      return {
        tools: deepseekTools,
        toolChoice: { type: 'function', name: toolChoice.toolName },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = toolChoice;
      toolWarnings.push({
        type: 'unsupported',
        feature: `tool choice type: ${(_exhaustiveCheck as { type: string }).type}`,
      });
      return { tools: deepseekTools, toolChoice: undefined, toolWarnings };
    }
  }
}
