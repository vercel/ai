import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Output } from 'ai';
import { z } from 'zod';
import { createCline } from './_create';
import { run } from '../../lib/run';

const output = Output.object({
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(
        z.object({
          name: z.string(),
          amount: z.number(),
          unit: z.enum(['oz', 'fl oz', 'cup', 'gallon']),
        }),
      ),
      steps: z.array(z.string()),
    }),
  }),
});

run(async () => {
  const agent = new HarnessAgent({
    harness: createCline(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      timeout: 10 * 60 * 1000,
    }),
    output,
  });
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Generate a lasagna recipe.',
    });

    for await (const partialObject of result.partialOutputStream) {
      console.clear();
      console.dir(partialObject, { depth: Infinity });
    }

    await result.output;
  } finally {
    await session.destroy();
  }
});
