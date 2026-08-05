import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  let executions = 0;
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }: { city: string }) => {
      executions += 1;
      return { city, celsius: city === 'Lima' ? 19 : 20 };
    },
  });
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    tools: { weather },
  });
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Do not use web search, shell commands, or any native tool. Call the MCP tool `mcp__ai-sdk-harness-tools__weather` exactly once with `{"city":"Lima"}`, then report its temperature result in one sentence.',
    });
    await printFullStream({ result });

    const weatherCalls = (await result.toolCalls).filter(
      toolCall => toolCall.toolName === 'weather',
    );
    if (weatherCalls.length !== 1 || executions !== 1) {
      throw new Error(
        `Expected one host-owned weather call, received ${weatherCalls.length} calls and ${executions} executions.`,
      );
    }
  } finally {
    await session.destroy();
  }
});
