import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import type {
  DeepSeekResponsesTool,
  DeepSeekResponsesToolChoice,
} from './deepseek-responses-api';

export function prepareDeepSeekResponsesTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools: Array<DeepSeekResponsesTool> | undefined;
  toolChoice: DeepSeekResponsesToolChoice | undefined;
  toolWarnings: SharedV4Warning[];
} {
  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null || tools.length === 0) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const deepseekTools: Array<DeepSeekResponsesTool> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      if (tool.id === 'deepseek.web_search') {
        deepseekTools.push({ type: 'web_search' });
      } else {
        toolWarnings.push({
          type: 'unsupported',
          feature: `provider-defined tool ${tool.id}`,
        });
      }
      continue;
    }

    if (tool.strict != null) {
      toolWarnings.push({
        type: 'unsupported',
        feature: 'strict tool calls',
        details: 'The DeepSeek Responses API does not support strict mode.',
      });
    }

    deepseekTools.push({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
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
    case 'tool': {
      const selected = tools.find(tool => tool.name === toolChoice.toolName);
      if (selected?.type === 'provider') {
        toolWarnings.push({
          type: 'unsupported',
          feature: `toolChoice for provider-defined tool ${selected.id}`,
        });
        return { tools: deepseekTools, toolChoice: undefined, toolWarnings };
      }
      return {
        tools: deepseekTools,
        toolChoice: { type: 'function', name: toolChoice.toolName },
        toolWarnings,
      };
    }
  }
}
