import { openai } from '@ai-sdk/openai';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const tools = {
  add: tool({
    description: 'Add two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a + b }),
  }),
  multiply: tool({
    description: 'Multiply two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ result: a * b }),
  }),
};

run(async () => {
  let stepCount = 0;

  try {
    const { textStream } = streamText({
      model: openai('gpt-4o-mini'),
      tools,
      stopWhen: isStepCount(5),
      prompt:
        'First add 7 and 5. Then multiply the result by 6. Then write a very long detailed essay (at least 500 words) about the number you got.',
      abortSignal: AbortSignal.timeout(10000),
      onStepFinish(step) {
        stepCount++;
        console.log(`\n[Step ${stepCount} finished]`);
        console.log('  Step usage:', step.usage);
      },
      onAbort({ usage, totalUsage, inputMessages, partialText }) {
        console.log('\n\nStream aborted mid-generation.');
        console.log('Current step usage:', usage);
        console.log('Total usage:', totalUsage);
        console.log('Input messages:', inputMessages);
        console.log('Partial text:', partialText);
      },
    });

    for await (const textPart of textStream) {
      process.stdout.write(textPart);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      console.log('\n\nAbortError: The run was aborted.');
    }
  }
});
