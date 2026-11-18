import { perplexity } from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: perplexity('low'),
    prompt: 'What are the best running shoe brands in Denmark right now?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  const metadata = (await result.providerMetadata)?.perplexity;

  console.log();
  console.log();
  console.log('Search count:', metadata?.usage);
  console.log('Search queries:', metadata?.searchQueries);
});
