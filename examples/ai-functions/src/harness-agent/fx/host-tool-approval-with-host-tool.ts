import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createFx } from './_create';
import { tool, type ToolApprovalRequestOutput } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createToolApprovalResponseMessages } from '../../lib/harness-tool-approval';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const fx = createFx();
const timeoutMs = 2 * 60 * 1000;

run(async () => {
  const executedTools: string[] = [];
  const createWriteTool = ({ toolName }: { toolName: string }) =>
    tool({
      description: 'Record a value in host-side memory.',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => {
        executedTools.push(toolName);
        return { toolName, value };
      },
    });

  const gatedWrite = createWriteTool({ toolName: 'gated_write' });
  const allowedWrite = createWriteTool({ toolName: 'allowed_write' });
  const agent = new HarnessAgent({
    harness: fx,
    tools: {
      gated_write: gatedWrite,
      allowed_write: allowedWrite,
    },
    toolApproval: {
      gated_write: 'user-approval',
      allowed_write: 'approved',
    },
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const toolCallNames: string[] = [];
    let approval: ToolApprovalRequestOutput<any> | undefined;
    const abortController = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abortController.abort(
        new Error('Timed out waiting for the turn to pause.'),
      );
    }, timeoutMs);

    try {
      const first = await agent.stream({
        session,
        abortSignal: abortController.signal,
        prompt:
          'Call `gated_write` and `allowed_write` in one assistant message, in that order, without waiting for either tool result. Use the value "gated" for `gated_write` and "allowed" for `allowed_write`. Do not call the tools in separate turns. After both results are available, summarize them in one sentence.',
      });
      await printFullStream({
        result: first,
        onToolCall: toolCall => {
          toolCallNames.push(toolCall.toolName);
        },
        onToolApproval: toolApproval => {
          approval ??= toolApproval;
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (approval?.toolCall.toolName !== 'gated_write') {
      throw new Error('Expected a user-approval request for gated_write.');
    }
    if (executedTools.includes('gated_write')) {
      throw new Error('Expected gated_write not to execute before approval.');
    }

    if (timedOut) {
      throw new Error(
        'The approval request did not finish the stream before the timeout.',
      );
    }

    console.log('The approval pause completed before the timeout.');
    const second = await agent.stream({
      session,
      messages: createToolApprovalResponseMessages({
        approval,
        approved: true,
      }),
    });
    await printFullStream({
      result: second,
      onToolCall: toolCall => {
        toolCallNames.push(toolCall.toolName);
      },
    });

    console.log('Host tool call order:', toolCallNames.join(' -> '));
    console.log('Executed host tools:', executedTools.join(' -> '));

    if (
      !toolCallNames.includes('gated_write') ||
      !toolCallNames.includes('allowed_write')
    ) {
      throw new Error(
        'Expected tool calls for both gated_write and allowed_write.',
      );
    }
    if (
      executedTools.filter(toolName => toolName === 'gated_write').length !==
        1 ||
      executedTools.filter(toolName => toolName === 'allowed_write').length !==
        1
    ) {
      throw new Error(
        'Expected gated_write and allowed_write to execute exactly once.',
      );
    }
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
