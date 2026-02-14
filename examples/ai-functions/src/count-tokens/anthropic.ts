import { anthropic } from '@ai-sdk/anthropic';
import { countTokens } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await countTokens({
    model: anthropic('claude-sonnet-4-5-20250929'),
    messages: [
      {
        role: 'user',
        content: 'Explain the theory of relativity in simple terms.',
      },
    ],
  });

  console.log('Token count:', result.tokens);
  console.log('Warnings:', result.warnings);
});
