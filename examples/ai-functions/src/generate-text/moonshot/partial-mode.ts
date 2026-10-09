import {
  moonshotai,
  type MoonshotAIAssistantMessageProviderOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const prefix = 'The sky is';

  const { text } = await generateText({
    model: moonshotai('kimi-k3'),
    messages: [
      {
        role: 'user',
        content: 'Write one short sentence about the color of the sky.',
      },
      {
        role: 'assistant',
        content: prefix,
        providerOptions: {
          moonshotai: {
            partial: true,
          } satisfies MoonshotAIAssistantMessageProviderOptions,
        },
      },
    ],
  });

  print('Continuation:', text);
  print('Complete response:', prefix + text);
});
