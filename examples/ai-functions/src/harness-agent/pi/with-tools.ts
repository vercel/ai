import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import { tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const pi = createPi();

run(async () => {
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }: { city: string }) => {
      const temps: Record<string, number> = {
        Paris: 12,
        Tokyo: 18,
        Reykjavik: 3,
      };
      return { city, celsius: temps[city] ?? 20 };
    },
  });

  const agent = new HarnessAgent({
    harness: pi,
    tools: { weather },
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt:
        'What is the weather in Paris and Reykjavik? Use the `weather` tool, then summarize in one sentence.',
    });

    const calledToolNames = new Set<string>();
    await printFullStream({
      result,
      onToolCall: toolCall => {
        calledToolNames.add(toolCall.toolName);
      },
    });

    const missingToolNames = ['weather'].filter(
      toolName => !calledToolNames.has(toolName),
    );
    if (missingToolNames.length > 0) {
      throw new Error(`Tools not called: ${missingToolNames.join(', ')}`);
    }

    console.log('steps:', (await result.steps).length);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
