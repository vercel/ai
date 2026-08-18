import { perplexity, type PerplexityAgentOptions } from './index';

perplexity.responses('openai/gpt-5-mini');
perplexity.responses('low');

perplexity.tools.webSearch({
  filters: {
    searchDomainFilter: ['example.com'],
    searchRecencyFilter: 'month',
  },
  maxResults: 5,
});
perplexity.tools.fetchUrl({ maxUrls: 2 });
perplexity.tools.financeSearch({});
perplexity.tools.peopleSearch({});
perplexity.tools.sandbox({});
perplexity.tools.mcp({
  serverLabel: 'internal',
  serverUrl: 'https://mcp.example.com',
  allowedTools: ['search'],
});

const options = {
  max_steps: 5,
  models: ['openai/gpt-5-mini', 'anthropic/claude-sonnet-4-6'],
  store: false,
} satisfies PerplexityAgentOptions;

void options;
