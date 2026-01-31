import { azure } from '@ai-sdk/azure';
import { countTokens } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await countTokens({
    model: azure('gpt-4o'), // Uses your AZURE_RESOURCE_NAME deployment
    messages: [
      {
        role: 'user',
        content: 'What are the benefits of cloud computing?',
      },
    ],
  });

  console.log('Token count (estimated via tiktoken):', result.tokens);
  console.log(
    'Is estimate:',
    result.providerMetadata?.openai?.estimatedTokenCount,
  );
});
