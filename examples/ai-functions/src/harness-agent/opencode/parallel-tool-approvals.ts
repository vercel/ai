import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createOpenCode } from './_create';
import { tool, type ToolApprovalRequestOutput } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createToolApprovalResponsesMessages } from '../../lib/harness-tool-approval';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const openCode = createOpenCode();

run(async () => {
  const executedCities: string[] = [];
  const executionCount = () => executedCities.length;
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
    harness: openCode,
    tools: { weather },
    toolApproval: {
      weather: 'user-approval',
    },
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
    ports: [4000],
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const approvalRequests: ToolApprovalRequestOutput<any>[] = [];
    let approvalResponseCount = 0;
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
        onToolApprovalResponse: () => {
          approvalResponseCount += 1;
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
    if (approvalResponseCount !== 2) {
      throw new Error(
        `Expected two weather approval responses, received ${approvalResponseCount}.`,
      );
    }
    if (toolResultCount !== 2) {
      throw new Error(
        `Expected two weather tool results, received ${toolResultCount}.`,
      );
    }
    if (executionCount() !== 2) {
      throw new Error(
        `Expected two weather executions, received ${executionCount()}.`,
      );
    }
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
