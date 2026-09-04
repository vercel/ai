import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createCursor } from './_create';

run(async () => {
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      await new Promise(resolve => setTimeout(resolve, 1_000));

      const temperatures: Record<string, number> = {
        Paris: 12,
        'Paris, Texas': 27,
      };

      return { city, celsius: temperatures[city] ?? 20 };
    },
  });

  const agent = new HarnessAgent({
    harness: createCursor(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    tools: { weather },
  });

  const session = await agent.createSession();
  let steered = false;

  try {
    const result = await agent.stream({
      session,
      prompt:
        'What is the weather in Paris? Use the `weather` tool, then summarize the result in one sentence.',
    });

    await printFullStream({
      result,
      onToolCall: async toolCall => {
        if (toolCall.toolName !== 'weather' || steered) return;

        steered = true;
        console.log('\nSTEER: Actually, I meant Paris, Texas.');
        await agent.experimental_steer({
          session,
          text: 'Actually, I meant Paris, Texas.',
        });
      },
    });

    if (!steered) {
      throw new Error('Expected the weather tool call to trigger steering.');
    }
  } finally {
    await session.destroy();
  }
});
