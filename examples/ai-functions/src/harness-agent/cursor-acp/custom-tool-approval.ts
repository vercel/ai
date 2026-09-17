import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool, type ToolApprovalRequestOutput } from 'ai';
import { z } from 'zod';
import { createCursorACP } from './_create';
import { createToolApprovalResponseMessages } from '../../lib/harness-tool-approval';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  let executions = 0;
  const getExecutions = () => executions;
  const weather = tool({
    description: 'Get the current temperature for a city.',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }: { city: string }) => {
      executions += 1;
      return { city, celsius: 19 };
    },
  });
  const agent = new HarnessAgent({
    harness: createCursorACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    tools: { weather },
    toolApproval: {
      weather: 'user-approval',
    },
  });
  const session = await agent.createSession();
  try {
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
    if (
      approval == null ||
      approval.toolCall.toolName !== 'weather' ||
      approval.toolCall.providerExecuted !== false
    ) {
      throw new Error('Expected a host-owned weather approval request.');
    }
    if (getExecutions() !== 0) {
      throw new Error('The host tool executed before approval.');
    }

    const second = await agent.stream({
      session,
      messages: createToolApprovalResponseMessages({
        approval,
        approved: true,
      }),
    });
    await printFullStream({ result: second });
    if (getExecutions() !== 1) {
      throw new Error(
        `Expected one weather execution, received ${getExecutions()}.`,
      );
    }
  } finally {
    await session.destroy();
  }
});
