import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: perplexity('low'),
    prompt: 'What are the best running shoe brands in Denmark right now?',
  });

  const metadata = result.finalStep.providerMetadata?.perplexity;

  console.log(result.text);
  console.log();
  console.log('Search count:', metadata?.usage);
  console.log('Search queries:', metadata?.searchQueries);
});
