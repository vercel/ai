import { perplexity } from '@ai-sdk/perplexity';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: perplexity('low'),
    prompt:
      'Use finance_search to get the latest AAPL stock quote. Report the price and date briefly.',
    maxOutputTokens: 1024,
    providerOptions: {
      perplexity: {
        tools: [{ type: 'finance_search' }],
      },
    },
  });

  console.log(result.text);
  console.log('Usage:', result.usage);
  // Native finance results remain available in the raw response.
  console.log('Response:', result.response.body);
  return result;
});
