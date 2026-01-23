import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const customProvider = createOpenAI({
    name: 'my-custom-openai',
    apiKey: process.env.OPENAI_API_KEY,
  });

  const result1 = await generateText({
    model: customProvider.chat('gpt-4o-mini'),
    prompt: 'Say "hello" in one word.',
    providerOptions: {
      openai: {
        user: 'test-user-canonical',
      },
    },
  });
  print('Result 1 - Content:', result1.text);
  print('Result 1 - providerMetadata:', result1.providerMetadata);
  // Expected: providerMetadata should have JUST THE 'openai' key
  print(
    'Result 1 - providerMetadata custom key:',
    result1.providerMetadata?.openai,
  );

  const result2 = await generateText({
    model: customProvider.chat('gpt-4o-mini'),
    prompt: 'Say "world" in one word.',
    providerOptions: {
      'my-custom-openai': {
        user: 'test-user-canonical',
      },
    },
  });
  print('Result 2 - Content:', result2.text);
  print('Result 2 - providerMetadata:', result2.providerMetadata);
  // Expected: providerMetadata should have 'openai' key AND 'my-custom-openai' key
  print(
    'Result 2 - providerMetadata custom key:',
    result2.providerMetadata?.['my-custom-openai'],
  );
});
