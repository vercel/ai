import { openai } from '@ai-sdk/openai';
import { experimental_createSteering, generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const steering = experimental_createSteering();
  let sent = false;

  const result = await generateText({
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
        .then(outcome => console.log('[paris-texas]', outcome.type));
    },
  });

  console.log(result.text);
  console.log('steps:', result.steps.length);
  console.log(
    'steering messages:',
    result.steps[0].experimental_steeringMessages,
  );
});
