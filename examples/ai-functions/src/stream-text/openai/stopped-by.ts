import { openai } from '@ai-sdk/openai';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-6.2-sol'),
    prompt: 'Check the weather in Paris, then in Berlin, then compare them.',
    tools: {
      weather: tool({
        description: 'Get the weather in a city',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => `It is sunny in ${city}.`,
      }),
    },
    stopWhen: isStepCount(2),
    onEnd: ({ stoppedBy }) => console.log('onEnd stopped by:', stoppedBy),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'finish') {
      console.log('Finish part stopped by:', part.stoppedBy);
    }
  }

  console.log('Steps:', (await result.steps).length);
  console.log('Finish reason:', await result.finishReason);
  console.log('Stopped by:', await result.stoppedBy);
});
