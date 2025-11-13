import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'What are the latest developments in quantum computing?',
    tools: {
      search: perplexity.tools.search({
        search_domain_filter: ['nature.com', 'science.org', 'arxiv.org'],
        search_recency_filter: 'month',
        max_results: 5,
      }),
    },
  });

  console.log(result.text);
  console.log('\nUsage:', result.usage);
}

main().catch(console.error);
