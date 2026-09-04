import {
  deepSeek,
  type DeepSeekMessageProviderOptions,
} from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: deepSeek('deepseek-chat'),
    instructions: {
      role: 'system',
      content: 'Help the customer plan a short trip.',
      providerOptions: {
        deepseek: {
          name: 'travel_planner',
        } satisfies DeepSeekMessageProviderOptions,
      },
    },
    messages: [
      {
        role: 'user',
        content: 'I want to visit Lisbon for a weekend.',
        providerOptions: {
          deepseek: {
            name: 'customer',
          } satisfies DeepSeekMessageProviderOptions,
        },
      },
      {
        role: 'assistant',
        content: 'What kinds of activities do you enjoy?',
        providerOptions: {
          deepseek: {
            name: 'travel_planner',
          } satisfies DeepSeekMessageProviderOptions,
        },
      },
      {
        role: 'user',
        content: 'Food, architecture, and walking.',
        providerOptions: {
          deepseek: {
            name: 'customer',
          } satisfies DeepSeekMessageProviderOptions,
        },
      },
    ],
  });

  print('Content:', result.content);
});
