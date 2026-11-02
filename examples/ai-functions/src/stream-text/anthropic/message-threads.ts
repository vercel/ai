import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const model = anthropic('claude-sonnet-4-6');
  const first = streamText({
    model,
    maxOutputTokens: 128,
    include: { rawChunks: true },
    system: 'Keep your answers brief.',
    prompt: 'Remember that my favorite color is cobalt blue.',
    providerOptions: { anthropic: { thread: { type: 'create' } } },
  });

  for await (const text of first.textStream) process.stdout.write(text);
  console.log();

  // Consume the entire stream before continuing: the ID from message_start
  // cannot be continued until Anthropic has sent message_stop.
  const response = await first.response;
  if (response.id == null) throw new Error('Missing message ID.');

  // Retain full history in your application for replay after expiration.
  // See the generate-text example for handling thread recovery errors.
  const second = streamText({
    model,
    maxOutputTokens: 128,
    include: { rawChunks: true },
    prompt: 'What is my favorite color?',
    providerOptions: {
      anthropic: {
        thread: { type: 'continue', previousMessageId: response.id },
      },
    },
  });
  for await (const text of second.textStream) process.stdout.write(text);
  console.log();
  return second;
});
