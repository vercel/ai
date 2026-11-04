import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    prompt: 'Explain how rainbows form in three sentences.',
    providerOptions: { anthropic: { includePings: true } },
  });

  for await (const part of result.stream) {
    if (part.type === 'ping') {
      console.log('[provider heartbeat]');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'error') {
      throw part.error;
    }
  }
});
