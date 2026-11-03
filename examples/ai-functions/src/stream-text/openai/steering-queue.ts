import { openai } from '@ai-sdk/openai';
import { experimental_createSteering, isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const steering = experimental_createSteering();

  const result = streamText({
    model: openai('gpt-6.1-sol'),
    prompt: 'What is the weather in Paris? Use the weather tool.',
    tools: {
      weather: tool({
        description: 'Get the weather in a city',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => {
          // the user sends follow-ups while the agent is still working. the ids
          // make this safe to run again: a repeated id returns the first outcome
          void steering
            .queue('Now compare it with the weather in Tokyo.', {
              id: 'compare-tokyo',
            })
            .then(outcome => console.log('\n[compare-tokyo]', outcome.type));
          void steering
            .queue('Finally, suggest what to pack for both trips.', {
              id: 'packing-list',
            })
            .then(outcome => console.log('\n[packing-list]', outcome.type));

          return { city, temperature: city === 'Paris' ? 18 : 24 };
        },
      }),
    },
    stopWhen: isStepCount(10),
    experimental_steering: steering,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  for (const step of await result.steps) {
    const queued = step.experimental_steeringMessages?.map(m => m.content);
    if (queued != null) {
      console.log(`\n\n[step ${step.stepNumber}] added:`, queued);
    }
  }
});
