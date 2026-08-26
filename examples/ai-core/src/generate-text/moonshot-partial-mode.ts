import {
  moonshotai,
  type MoonshotAIAssistantMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    messages: [
      {
        role: 'user',
        content: 'Complete this sentence about the night sky.',
      },
      {
        role: 'assistant',
        content: 'The stars above the city',
        providerOptions: {
          moonshotai: {
            partial: true,
          } satisfies MoonshotAIAssistantMessageProviderOptions,
        },
      },
    ],
  });

  console.log(result.text);
});
