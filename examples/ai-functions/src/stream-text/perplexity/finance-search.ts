import { perplexity } from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: perplexity('low'),
    prompt:
      'Use finance_search to get the latest AAPL stock quote. Report the price and date briefly.',
    maxOutputTokens: 1024,
    providerOptions: {
      perplexity: {
        tools: [{ type: 'finance_search' }],
      },
    },
    include: { rawChunks: true },
  });

  await printFullStream({ result });
  return result;
});
