import {
  HarnessAgent,
  HarnessCapabilityUnsupportedError,
} from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  let weatherExecutions = 0;
  let timeExecutions = 0;
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }: { city: string }) => {
      weatherExecutions += 1;
      return { city, celsius: 19 };
    },
  });
  const time = tool({
    description: 'Get the current local time for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }: { city: string }) => {
      timeExecutions += 1;
      return { city, localTime: '09:30' };
    },
  });
  const harness = createCodexACP();
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const weatherAgent = new HarnessAgent({
    harness,
    sandbox,
    tools: { weather },
  });
  const timeAgent = new HarnessAgent({
    harness,
    sandbox,
    tools: { time },
  });
  const session = await weatherAgent.createSession();

  try {
    const first = await weatherAgent.stream({
      session,
      prompt:
        'Do not use web search, shell commands, or any native tool. Call `mcp__ai-sdk-harness-tools__weather` exactly once with `{"city":"Lima"}`, then report its result in one sentence.',
    });
    await printFullStream({ result: first });
    const firstCalls = await first.toolCalls;
    if (
      firstCalls.length !== 1 ||
      firstCalls[0]?.toolName !== 'weather' ||
      weatherExecutions !== 1
    ) {
      throw new Error(
        `Expected one weather call in turn 1, received ${firstCalls.length} calls and ${weatherExecutions} executions.`,
      );
    }

    const second = await timeAgent.stream({
      session,
      prompt:
        'The weather tool is no longer active. Do not use web search, shell commands, or any native tool. Call `mcp__ai-sdk-harness-tools__time` exactly once with `{"city":"Lima"}`, then report its result in one sentence.',
    });
    let refreshError: unknown;
    try {
      await second.text;
    } catch (error) {
      refreshError = error;
    }
    if (
      !HarnessCapabilityUnsupportedError.isInstance(refreshError) ||
      timeExecutions !== 0 ||
      weatherExecutions !== 1
    ) {
      throw new Error(
        `Expected Codex ACP to reject the changed catalog without executing a stale tool; received ${timeExecutions} time executions and ${weatherExecutions} weather executions.`,
      );
    }
    console.log(
      'Codex ACP failed closed with HarnessCapabilityUnsupportedError after the host-tool catalog changed.',
    );
  } finally {
    await session.destroy();
  }
});
