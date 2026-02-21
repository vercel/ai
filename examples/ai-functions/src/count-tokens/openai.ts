import { openai } from '@ai-sdk/openai';
import { countTokens } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await countTokens({
    model: openai('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: 'Explain the difference between TCP and UDP.',
      },
    ],
  });

  console.log('Token count (estimated via tiktoken):', result.tokens);
  console.log(
    'Is estimate:',
    result.providerMetadata?.openai?.estimatedTokenCount,
  );
});
