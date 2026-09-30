import type {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
} from '@ai-sdk/provider';
import type { PerplexityAgentTool } from './perplexity-agent-api';

export function preparePerplexityTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice: LanguageModelV2CallOptions['toolChoice'];
}): {
  tools: PerplexityAgentTool[];
  warnings: LanguageModelV2CallWarning[];
} {
  const preparedTools: PerplexityAgentTool[] = [];
  const warnings: LanguageModelV2CallWarning[] = [];

  for (const tool of tools ?? []) {
    if (tool.type === 'provider-defined') {
      warnings.push({ type: 'unsupported-tool', tool });
      continue;
    }

    preparedTools.push({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    });
  }

  if (toolChoice != null && toolChoice.type !== 'auto') {
    warnings.push({
      type: 'unsupported-setting',
      setting: 'toolChoice',
      details:
        'The Perplexity Agent API currently selects tools automatically.',
    });
  }

  return { tools: preparedTools, warnings };
}
