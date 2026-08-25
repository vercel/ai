import {
  moonshotai,
  type MoonshotAIAssistantMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    messages: [
      {
        role: 'user',
        content: 'Return a JSON object with a short holiday name.',
      },
      {
        role: 'assistant',
        content: '{',
        providerOptions: {
          moonshotai: {
            partial: true,
          } satisfies MoonshotAIAssistantMessageProviderOptions,
        },
      },
    ],
  });

  console.log(`{${result.text}`);
});
