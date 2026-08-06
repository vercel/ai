import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import {
  createToolApprovalResponseMessages,
  printFullStreamAndCaptureToolApproval,
} from '../../lib/harness-tool-approval';
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
      prompt: 'Create `approval-accepted.txt` containing exactly `accepted`.',
    });
    const approval = await printFullStreamAndCaptureToolApproval({
      result: first,
    });
    if (approval == null || approval.toolCall.providerExecuted === false) {
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
