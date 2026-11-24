import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';
import { tool, type ToolApprovalRequestOutput } from 'ai';
import { z } from 'zod';
import { createToolApprovalResponsesMessages } from '../../lib/harness-tool-approval';
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
    const approvalRequests: ToolApprovalRequestOutput<any>[] = [];
    let toolResultCount = 0;

    let streamResult = await agent.stream({
      session,
      prompt:
        'What is the weather in Paris and in Tokyo? Call the `weather` tool for both cities in parallel, in the same response, then summarize in one sentence.',
    });

    while (true) {
      const pendingApprovals: ToolApprovalRequestOutput<any>[] = [];
      await printFullStream({
        result: streamResult,
        onToolApproval: toolApproval => {
          pendingApprovals.push(toolApproval);
          approvalRequests.push(toolApproval);
        },
        onToolResult: chunk => {
          if (chunk.toolName === 'weather' && !chunk.preliminary) {
            toolResultCount += 1;
          }
        },
      });

      if (pendingApprovals.length === 0) {
        break;
      }

      streamResult = await agent.stream({
        session,
        messages: createToolApprovalResponsesMessages({
          approvals: pendingApprovals,
          approved: true,
        }),
      });
    }

    if (
      approvalRequests.length !== 2 ||
      approvalRequests.some(
        approval => approval.toolCall.toolName !== 'weather',
      )
    ) {
      throw new Error(
        `Expected two weather approval requests, received ${approvalRequests.length}.`,
      );
    }
    if (toolResultCount !== 2) {
      throw new Error(
        `Expected two weather tool results, received ${toolResultCount}.`,
      );
    }
    if (executedCities.length !== 2) {
      throw new Error(
        `Expected two weather executions, received ${executedCities.length}.`,
      );
    }
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
