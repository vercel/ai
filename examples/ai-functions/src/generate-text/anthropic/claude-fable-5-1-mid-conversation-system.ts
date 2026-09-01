import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-fable-5-1'),
    allowSystemInMessages: true,
    messages: [
      {
        role: 'user',
        content: 'Draft a short launch announcement for a developer tool.',
      },
      {
        role: 'assistant',
        content:
          'Today we are launching a faster way to build developer tools.',
      },
      {
        role: 'user',
        content: 'Rewrite and finalize the announcement.',
      },
      {
        role: 'system',
        content:
          'For the next turn only, verify every claim and use high effort.',
        providerOptions: {
          anthropic: {
            clearAt: 'next_user_message',
          },
        },
      },
    ],
  });

  print('Text:', result.text);
  print('Request:', result.request.body);
});
