import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCodex } from './_create';
import { tool, type ToolApprovalRequestOutput } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createToolApprovalResponseMessages } from '../../lib/harness-tool-approval';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const codex = createCodex();

run(async () => {
  const agent = new HarnessAgent({
    harness: codex,
    permissionMode: 'allow-reads',
    tools: {
      ping: tool({
        description: 'Return a simple test response from the host.',
        inputSchema: z.object({}),
        execute: async () => 'pong',
      }),
    },
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const first = await agent.stream({
      session,
      prompt:
        'Run `ls` with Bash and call the `ping` host tool right away at the same time. Issue both tool calls in the same turn, in parallel, without waiting for either result. Then tell me the directory contents and the host tool response.',
    });
    let approval: ToolApprovalRequestOutput<any> | undefined;
    await printFullStream({
      result: first,
      onToolApproval: toolApproval => {
        approval ??= toolApproval;
      },
    });
    if (approval?.toolCall.toolName !== 'bash') {
      throw new Error('Expected a built-in Bash tool approval request.');
    }

    const second = await agent.stream({
      session,
      messages: createToolApprovalResponseMessages({
        approval,
        approved: true,
      }),
    });
    await printFullStream({ result: second });
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
