import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';
import { tool, type ToolApprovalRequestOutput } from 'ai';
import { z } from 'zod';
import { createToolApprovalResponseMessages } from '../../lib/harness-tool-approval';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const executedCities: string[] = [];
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }: { city: string }) => {
      executedCities.push(city);
      const temps: Record<string, number> = {
        Paris: 12,
        Tokyo: 18,
        Reykjavik: 3,
      };
      return { city, celsius: temps[city] ?? 20 };
    },
  });

  const agent = new HarnessAgent({
    harness: createPi(),
    tools: { weather },
    toolApproval: { weather: 'user-approval' },
    getSandboxSession: ({ sandboxId }) =>
      resumeVercelNetworkSandboxSession({ sandboxId }),
  });
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });
  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const first = await agent.stream({
      session,
      prompt:
        'What is the weather in Paris? Use the `weather` tool, then summarize in one sentence.',
    });
    let approval: ToolApprovalRequestOutput<any> | undefined;
    await printFullStream({
      result: first,
      onToolApproval: toolApproval => {
        approval ??= toolApproval;
      },
    });
    if (approval?.toolCall.toolName !== 'weather') {
      throw new Error('Expected a weather tool approval request.');
    }
    if (executedCities.length > 0) {
      throw new Error('The weather tool ran before it was approved.');
    }

    const second = await agent.stream({
      session,
      messages: createToolApprovalResponseMessages({
        approval,
        approved: true,
      }),
    });
    await printFullStream({ result: second });
    if (executedCities.length !== 1) {
      throw new Error(
        `Expected one weather execution, received ${executedCities.length}.`,
      );
    }
    console.log('finishReason:', await second.finishReason);
  } finally {
    if (
      session != null &&
      'destroy' in session &&
      typeof session.destroy === 'function'
    )
      await session.destroy();
    await sandboxSession.destroy();
  }
});
