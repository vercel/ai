import {
  moonshotai,
  type MoonshotAIMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    messages: [
      {
        role: 'user',
        content: 'Invent a new holiday and describe its traditions.',
        providerOptions: {
          moonshotai: {
            name: 'holiday_planner',
          } satisfies MoonshotAIMessageProviderOptions,
        },
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
