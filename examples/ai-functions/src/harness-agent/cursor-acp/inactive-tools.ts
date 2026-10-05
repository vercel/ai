import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { createCursorACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

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
    harness: createCursorACP(),
    tools: { weather },
    inactiveTools: ['weather'],
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
        'Report whether a host-provided weather tool is available. Do not use shell commands or network requests.',
    });

    await printFullStream({ result });
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
