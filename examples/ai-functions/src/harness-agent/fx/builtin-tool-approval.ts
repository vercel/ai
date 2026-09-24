import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createFx } from './_create';
import type { ToolApprovalRequestOutput } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createToolApprovalResponseMessages } from '../../lib/harness-tool-approval';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const fx = createFx();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: fx,
    sandbox,
    permissionMode: 'allow-edits',
  });

  const session = await agent.createSession();
  try {
    const first = await agent.stream({
      session,
      prompt:
        'Use the shell tool to create a new text file named `approval-example.txt` containing `Tool approval succeeded.`.',
    });
    let approval: ToolApprovalRequestOutput<any> | undefined;
    await printFullStream({
      result: first,
      onToolApproval: toolApproval => {
        approval ??= toolApproval;
      },
    });
    if (approval?.toolCall.toolName !== 'shell') {
      throw new Error('Expected a built-in shell tool approval request.');
    }
    if ('invalid' in approval.toolCall && approval.toolCall.invalid === true) {
      throw new Error('Expected the shell input to match the fx ACP schema.');
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
