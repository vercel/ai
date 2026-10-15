import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { createFx } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  let executions = 0;
  let calculatedSum: number | undefined;
  const calculator = tool({
    description: 'Add two numbers from a named source.',
    inputSchema: z.object({
      operation: z.literal('add'),
      origin: z.literal('client'),
      a: z.number(),
      b: z.number(),
    }),
    execute: async ({ a, b }: { a: number; b: number }) => {
      executions += 1;
      calculatedSum = a + b;
      return { sum: calculatedSum };
    },
  });

  const agent = new HarnessAgent({
    harness: createFx(),
    tools: { calculator },
  });
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt:
        'Use the calculator tool once with operation "add", origin "client", a 2, and b 3. Then report the sum.',
    });
    const calledToolNames = new Set<string>();
    await printFullStream({
      result,
      onToolCall: toolCall => {
        calledToolNames.add(toolCall.toolName);
      },
    });

    if (
      !calledToolNames.has('calculator') ||
      executions !== 1 ||
      calculatedSum !== 5
    ) {
      throw new Error('Expected one calculator call returning a sum of 5.');
    }
    console.log('steps:', (await result.steps).length);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
