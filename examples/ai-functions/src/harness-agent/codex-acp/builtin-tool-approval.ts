import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { ToolApprovalRequestOutput } from 'ai';
import { createCodexACP } from './_create';
import { createToolApprovalResponseMessages } from '../../lib/harness-tool-approval';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    permissionMode: 'allow-reads',
  });
  const session = await agent.createSession();
  try {
    const first = await agent.stream({
      session,
      prompt: 'Run `pwd` with Bash and tell me the working directory.',
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
      approval.toolCall.toolName !== 'bash' ||
      approval.toolCall.providerExecuted === false
    ) {
      throw new Error('Expected a native ACP tool approval request.');
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
    await session.destroy();
  }
});
