import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();
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
    harness: createCodex(),
    sandbox,
    tools: { weather },
  });

  let exitCode = 0;
  try {
    const result = await agent.generate({
      prompt:
        'What is the weather in Paris and Reykjavik? Use the `weather` tool, then summarize in one sentence.',
    });
    console.log('text:', result.text);
    console.log('toolCalls:', result.toolCalls);
    console.log('toolResults:', result.toolResults);
    console.log('steps:', result.steps.length);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    await sandbox.stop();
    process.exit(exitCode);
  }
});
