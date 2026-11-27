import { subquadratic } from '@ai-sdk/subquadratic';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: subquadratic('subq-savant-1.4'),
    reasoning: 'low',
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    stopWhen: isStepCount(3),
    prompt: 'What is the weather in San Francisco? Use the weather tool.',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'tool-input-start':
      case 'tool-call':
      case 'tool-result':
        console.log(part);
        break;
      case 'text-delta':
        process.stdout.write(part.text);
        break;
    }
  }

  console.log();
  console.log('Token usage:', await result.totalUsage);
  console.log('Finish reason:', await result.finishReason);
});
