import { vertex } from '@ai-sdk/google-vertex';
import { countTokens } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await countTokens({
    model: vertex('gemini-2.0-flash'),
    messages: [
      {
        role: 'user',
        content: 'Explain machine learning in simple terms.',
      },
    ],
  });

  console.log('Token count:', result.tokens);
  console.log('Provider metadata:', result.providerMetadata);
});
