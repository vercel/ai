import { openai } from '@ai-sdk/openai';
import { experimental_createSteering, streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const steering = experimental_createSteering();
  let sent = false;

  const result = streamText({
    model: openai('gpt-6.1-sol'),
    prompt: 'In one sentence, what is Paris famous for?',
    experimental_steering: steering,
    onLanguageModelCallStart: () => {
      if (sent) {
        return;
      }
      sent = true;
      void steering
        .steer('Actually I mean Paris, Texas. Answer about that one.', {
          id: 'paris-texas',
          interrupt: true,
        })
        .then(outcome => console.log('\n[paris-texas]', outcome.type));
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'steering-message') {
      console.log('[steering-message]', part.message.content);
    }
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log('\n\nsteps:', (await result.steps).length);
});
