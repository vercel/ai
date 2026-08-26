import {
  moonshotai,
  type MoonshotAIMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    messages: [
      {
        role: 'system',
        content: 'Help the customer plan a short trip.',
        providerOptions: {
          moonshotai: {
            name: 'travel_planner',
          } satisfies MoonshotAIMessageProviderOptions,
        },
      },
      {
        role: 'user',
        content: 'I want to visit Lisbon for a weekend.',
        providerOptions: {
          moonshotai: {
            name: 'customer',
          } satisfies MoonshotAIMessageProviderOptions,
        },
      },
    ],
  });

  console.log(result.text);
});
