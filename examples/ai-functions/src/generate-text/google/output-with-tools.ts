import { google } from '@ai-sdk/google';
import { generateText, isStepCount, Output, streamText, tool } from 'ai';
import * as z from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const options = {
    model: google('gemini-2.5-flash-lite'),
    output: Output.array({ element: z.object({ date: z.string() }) }),
    tools: {
      resolveDate: tool({
        description: 'Look up the date to use in the answer.',
        inputSchema: z.object({}),
        execute: async () => ({ date: '2031-06-17' }),
      }),
    },
    // Require the application tool on the first step, then allow the final answer.
    prepareStep: ({ stepNumber }: { stepNumber: number }) => ({
      toolChoice:
        stepNumber === 0
          ? ({ type: 'tool', toolName: 'resolveDate' } as const)
          : ('auto' as const),
    }),
    stopWhen: isStepCount(3),
    prompt:
      'Look up the date with resolveDate, then return an array containing that date.',
  };

  const generated = await generateText(options);
  console.log('Generated:', generated.output);
  console.log('Steps:', generated.steps.length);

  const streamed = streamText(options);
  for await (const output of streamed.partialOutputStream) {
    console.log('Partial:', output);
  }
  console.log('Streamed:', await streamed.output);
  console.log('Steps:', (await streamed.steps).length);
});
