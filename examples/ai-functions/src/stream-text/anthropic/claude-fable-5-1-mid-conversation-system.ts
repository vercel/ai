import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { print } from '../../lib/print';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-fable-5-1'),
    allowSystemInMessages: true,
    messages: [
      {
        role: 'user',
        content: 'Suggest a migration plan for a small TypeScript library.',
      },
      {
        role: 'assistant',
        content: 'First, inventory the public API and current test coverage.',
      },
      {
        role: 'user',
        content: 'Continue with the complete plan.',
      },
      {
        role: 'system',
        content:
          'For the next turn only, inspect edge cases with xhigh effort.',
        providerOptions: {
          anthropic: {
            clearAt: 'next_user_message',
          },
        },
      },
    ],
  });

  await printFullStream({ result });
  print('Request:', await result.request);
});
