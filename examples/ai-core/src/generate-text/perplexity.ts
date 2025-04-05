import 'dotenv/config';
import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: perplexity('sonar-pro'),
    prompt: 'What has happened in San Francisco recently?',
    providerOptions: {
      perplexity: {
        search_recency_filter: 'week',
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:');
  console.log(result.sources);
  console.log('Citations:');
  console.log(result.citations);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Metadata:', result.providerMetadata);

  console.log(JSON.stringify(result.response.body, null, 2));
}

main().catch(console.error);
