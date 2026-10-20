/*
 * Cross-process variant of `parallel-tool-approvals.ts` for the Pi harness.
 *
 * The first agent stops at the two approval requests and detaches. In-process
 * reattachment is disabled, so a fresh `HarnessAgent` resumes the session
 * from the persisted resume state, the same way a separate REST request would,
 * and submits both approvals.
 */
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import { tool, type ToolApprovalRequestOutput } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createToolApprovalResponsesMessages } from '../../lib/harness-tool-approval';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const pi = createPi({ reattachInProcess: false });

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
  const createAgent = () =>
    new HarnessAgent({
      harness: pi,
      tools: { weather },
      toolApproval: {
        weather: 'user-approval',
      },
    });

  const firstAgent = createAgent();
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await firstAgent.getSandboxTemplate(),
  });
  try {
    const approvals: ToolApprovalRequestOutput<any>[] = [];
    let sessionId: string;
    let resumeState: HarnessAgentResumeSessionState;
    {
      const session = await firstAgent.createSession({ sandboxSession });
      sessionId = session.sessionId;
      const first = await firstAgent.stream({
        session,
        prompt:
          'What is the weather in Paris and in Tokyo? Call the `weather` tool for both cities in parallel, in the same response, then summarize in one sentence.',
      });
      await printFullStream({
        result: first,
        onToolApproval: toolApproval => {
          approvals.push(toolApproval);
        },
      });
      resumeState = await session.detach();
    }
    if (
      approvals.length !== 2 ||
      approvals.some(approval => approval.toolCall.toolName !== 'weather')
    ) {
      throw new Error(
        `Expected two weather approval requests in the same response, received ${approvals.length}.`,
      );
    }
    if (executionCount() !== 0) {
      throw new Error('The weather tool executed before approval.');
    }

    const secondAgent = createAgent();
    const session = await secondAgent.createSession({
      sandboxSession,
      sessionId,
      resumeFrom: resumeState,
    });
    try {
      const second = await secondAgent.stream({
        session,
        messages: createToolApprovalResponsesMessages({
          approvals,
          approved: true,
        }),
      });
      let unexpectedApprovals = 0;
      await printFullStream({
        result: second,
        onToolApproval: () => {
          unexpectedApprovals += 1;
        },
      });
      if (unexpectedApprovals !== 0) {
        throw new Error(
          `Expected no further approval requests, received ${unexpectedApprovals}.`,
        );
      }
      if (executionCount() !== 2) {
        throw new Error(
          `Expected two weather executions, received ${executionCount()}.`,
        );
      }
    } finally {
      await session.destroy();
    }
  } finally {
    await sandboxSession.destroy();
  }
});
