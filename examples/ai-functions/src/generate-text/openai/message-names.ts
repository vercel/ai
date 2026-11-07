import { openai, type OpenAIChatMessageProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.chat('gpt-4.1-mini'),
    messages: [
      {
        role: 'user',
        content: 'My favorite color is blue.',
        providerOptions: {
          openai: { name: 'alice' } satisfies OpenAIChatMessageProviderOptions,
        },
      },
      {
        role: 'user',
        content: 'My favorite color is green. What are our favorite colors?',
        providerOptions: {
          openai: { name: 'bob' } satisfies OpenAIChatMessageProviderOptions,
        },
      },
    ],
  });

  console.log(result.text);
});
