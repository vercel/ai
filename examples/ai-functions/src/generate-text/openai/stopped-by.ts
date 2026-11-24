import { openai } from '@ai-sdk/openai';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
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
  });

  console.log('Steps:', result.steps.length);
  console.log('Finish reason:', result.finishReason);
  console.log('Stopped by:', result.stoppedBy);
});
