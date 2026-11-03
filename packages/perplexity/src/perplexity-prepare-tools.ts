import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import type { PerplexityAgentTool } from './perplexity-agent-api';

export function preparePerplexityTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools: PerplexityAgentTool[];
  warnings: SharedV4Warning[];
} {
  const preparedTools: PerplexityAgentTool[] = [];
  const warnings: SharedV4Warning[] = [];

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
