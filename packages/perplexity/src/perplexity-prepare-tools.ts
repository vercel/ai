import type {
  LanguageModelV3CallOptions,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { PerplexityAgentTool } from './perplexity-agent-api';

export function preparePerplexityTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice: LanguageModelV3CallOptions['toolChoice'];
}): {
  tools: PerplexityAgentTool[];
  warnings: SharedV3Warning[];
} {
  const preparedTools: PerplexityAgentTool[] = [];
  const warnings: SharedV3Warning[] = [];

  for (const tool of tools ?? []) {
    if (tool.type === 'provider') {
      warnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.name}`,
      });
      continue;
    }

    preparedTools.push({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: tool.strict,
    });
  }

  if (toolChoice != null && toolChoice.type !== 'auto') {
    warnings.push({
      type: 'unsupported',
      feature: 'toolChoice',
      details:
        'The Perplexity Agent API currently selects tools automatically.',
    });
  }

  return { tools: preparedTools, warnings };
}
