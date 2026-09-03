import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createGitHubCopilot } from './_create';
import { tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const githubCopilot = createGitHubCopilot();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
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
    harness: githubCopilot,
    sandbox,
    tools: { weather },
    inactiveTools: ['view', 'bash', 'grep', 'glob', 'list_bash'],
  });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Use the `weather` tool for Paris, then read README.md and summarize both results in one sentence.',
    });

    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
});
