import { moonshotai } from '@ai-sdk/moonshotai';
import { weatherTool } from '../../tools/weather-tool';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
<<<<<<< HEAD
    model: moonshotai('kimi-k2.5'),
    stopWhen: stepCountIs(5),
=======
    model: moonshotai('kimi-k3'),
    stopWhen: isStepCount(5),
>>>>>>> 341616a326 (feat: add kimi-k3 model and `reasoningEffort` provider option (#17394))
    tools: {
      currentLocation: tool({
        description: 'Get the current location.',
        inputSchema: z.object({}),
        execute: async () => {
          const locations = ['New York', 'London', 'Paris'];
          return {
            location: locations[Math.floor(Math.random() * locations.length)],
          };
        },
      }),
      weather: weatherTool,
    },
    prompt: 'What is the weather in my current location?',
  });

<<<<<<< HEAD
  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.text);
        break;
      }

      case 'tool-call': {
        console.log(
          `TOOL CALL ${chunk.toolName} ${JSON.stringify(chunk.input)}`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `TOOL RESULT ${chunk.toolName} ${JSON.stringify(chunk.output)}`,
        );
        break;
      }

      case 'finish-step': {
        console.log();
        console.log();
        break;
      }
    }
  }
=======
  await printFullStream({ result });
>>>>>>> 341616a326 (feat: add kimi-k3 model and `reasoningEffort` provider option (#17394))

  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
