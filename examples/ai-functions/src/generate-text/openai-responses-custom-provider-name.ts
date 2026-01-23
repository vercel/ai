import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';
import { openai } from '@ai-sdk/openai';

run(async () => {
  const customProvider = createOpenAI({
    name: 'my-custom-openai',
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Case 1: Using canonical 'openai' key in providerOptions
  const result1 = await generateText({
    model: customProvider('gpt-5'),
    prompt: 'Say "hello" in one word.',
    providerOptions: {
      openai: {
        reasoningEffort: 'high',
      },
    },
  });
  print('Result 1 - Content:', result1.text);
  print('Result 1 - providerMetadata:', result1.providerMetadata);
  // Should only have 'openai' key

  // Case 2: Using custom provider key in providerOptions
  const result2 = await generateText({
    model: customProvider('gpt-5'),
    prompt: 'Say "world" in one word.',
    providerOptions: {
      'my-custom-openai': {
        reasoningEffort: 'high',
      },
    },
  });
  print('Result 2 - Content:', result2.text);
  print('Result 2 - providerMetadata:', result2.providerMetadata);
  // Should have both 'openai' and 'my-custom-openai' keys

  // Case 3: No providerOptions
  const result3 = await generateText({
    model: customProvider('gpt-5'),
    prompt: 'Say "test" in one word.',
  });
  print('Result 3 - Content:', result3.text);
  print('Result 3 - providerMetadata:', result3.providerMetadata);
  // Should only have 'openai' key

  const result4 = await generateText({
    model: openai('gpt-5'),
    prompt: 'Say "BANANA" in one word.',
  });
  print('Result 4 - Content:', result4.text);
  print('Result 4 - providerMetadata:', result4.providerMetadata);
  // Should only have 'openai' key

  const result5 = await generateText({
    model: openai('gpt-5'),
    prompt: 'Say "TEST 5" in one word.',
    providerOptions: {
      openai: {
        reasoningEffort: 'high',
      },
    },
  });
  print('Result 5 - Content:', result5.text);
  print('Result 5 - providerMetadata:', result5.providerMetadata);
  // Should only have 'openai' key

  const result6 = await generateText({
    model: openai('gpt-5'),
    prompt: 'Say "TEST 6" in one word.',
    providerOptions: {
      'my-custom-openai': {
        reasoningEffort: 'high',
      },
    },
  });
  print('Result 6 - Content:', result6.text);
  print('Result 6 - providerMetadata:', result6.providerMetadata);
  // Should only have 'openai' key
});
