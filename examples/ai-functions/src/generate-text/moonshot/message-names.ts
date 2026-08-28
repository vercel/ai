import {
  moonshotai,
  type MoonshotAIMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    instructions: {
      role: 'system',
      content: 'Help the customer plan a short trip.',
      providerOptions: {
        moonshotai: {
          name: 'travel_planner',
        } satisfies MoonshotAIMessageProviderOptions,
      },
    },
    messages: [
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

  print('Content:', result.content);
});
