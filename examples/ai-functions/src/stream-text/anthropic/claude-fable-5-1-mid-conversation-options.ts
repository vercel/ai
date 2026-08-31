import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-fable-5-1'),
    allowSystemInMessages: true,
    messages: [
      { role: 'user', content: 'Draft a short launch announcement.' },
      {
        role: 'assistant',
        content: 'We are excited to announce our new product.',
      },
      {
        role: 'system',
        content:
          'For the next turn only, carefully rewrite the announcement for developers.',
        providerOptions: {
          anthropic: {
            clearAt: 'next_user_message',
            effort: 'high',
          },
        },
      },
      { role: 'user', content: 'Include one concrete technical benefit.' },
    ],
  });

  await printFullStream({ result });
});
