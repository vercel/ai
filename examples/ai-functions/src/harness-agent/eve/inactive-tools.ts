import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createEve } from '@ai-sdk/harness-eve';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const url = process.env.EVE_BASIC_AGENT_URL;
  if (!url) {
    throw new Error('Set EVE_BASIC_AGENT_URL to a remote Eve agent URL.');
  }

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
    harness: createEve({ url }),
    sandbox: createJustBashSandbox(), // Ignored by eve harness.
    tools: { weather },
    inactiveTools: ['read', 'bash', 'grep', 'glob'],
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Use the `weather` tool for Paris, then read README.md and summarize both results in one sentence.',
    });

    await printFullStream({ result });
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
