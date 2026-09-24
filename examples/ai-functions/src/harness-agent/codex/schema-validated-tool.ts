import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createCodex } from './_create';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  let executions = 0;
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({
      city: z.string().transform(city => city.trim().toUpperCase()),
      unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
    }),
    execute: async ({ city, unit }) => {
      if (city !== 'BERLIN' || unit !== 'celsius') {
        throw new Error('The tool did not receive validated input.');
      }
      executions += 1;
      return { city, unit, temperature: 18 };
    },
  });
  const agent = new HarnessAgent({
    harness: createCodex(),
    sandbox,
    tools: { weather },
  });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'What is the weather in Berlin? Use the weather tool with city "Berlin" and omit the unit.',
    });
    await printFullStream({ result });
    if (executions !== 1) {
      throw new Error(
        `Expected one weather tool execution, got ${executions}.`,
      );
    }
  } finally {
    await session.destroy();
  }
});
