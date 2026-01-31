import { google } from '@ai-sdk/google';
import { countTokens } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await countTokens({
    model: google('gemini-2.0-flash'),
    messages: [
      {
        role: 'user',
        content: 'Write a haiku about programming.',
      },
    ],
  });

  console.log('Token count:', result.tokens);
  console.log('Provider metadata:', result.providerMetadata);
});
