import { createGateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const gateway = createGateway({
    baseURL: 'http://localhost:3000/v1/ai',
  });

  const result = streamText({
    model: gateway('openai/gpt-5-nano'),
    prompt: `Search for news about AI regulations from the first week of January 2025. 
Use the perplexitySearch tool with specific date filtering:
- Use search_after_date: "1/1/2025" to get results from January 1st onwards
- Use search_before_date: "1/8/2025" to limit to the first week
Tell me what you found about AI policy changes in that period.`,
    tools: {
      perplexitySearch: gateway.tools.perplexitySearch({
        maxResults: 5,
        searchLanguageFilter: ['en'],
        country: 'US',
        searchDomainFilter: ['reuters.com', 'bbc.com', 'nytimes.com'],
      }),
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'reasoning-delta':
        process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
        break;
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'tool-call':
        console.log('\nTool call:', JSON.stringify(part, null, 2));
        break;
      case 'tool-result':
        console.log('\nTool result:', JSON.stringify(part, null, 2));
        break;
      case 'tool-error':
        console.log('\nTool error:', JSON.stringify(part, null, 2));
        break;
      case 'finish':
        break;
      default:
        console.log('\nEvent:', JSON.stringify(part, null, 2));
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Provider metadata:',
    JSON.stringify(await result.providerMetadata, null, 2),
  );
}

main().catch(console.error);
