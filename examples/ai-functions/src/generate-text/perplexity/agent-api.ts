import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import 'dotenv/config';

const result = await generateText({
  model: perplexity.responses('fast'),
  prompt: 'What are the latest developments in small language models?',
  tools: {
    web_search: perplexity.tools.webSearch({
      searchContextSize: 'low',
      maxResults: 5,
    }),
  },
});

console.log(result.text);
console.log(result.sources);
console.log(result.providerMetadata?.perplexity?.cost);
