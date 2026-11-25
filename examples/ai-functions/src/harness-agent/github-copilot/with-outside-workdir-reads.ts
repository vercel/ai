import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import type { ToolApprovalRequestOutput } from 'ai';
import { createGitHubCopilot } from './_create';
import { createToolApprovalResponsesMessages } from '../../lib/harness-tool-approval';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createGitHubCopilot(),
    permissionMode: 'allow-reads',
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
    const approvalRequests: ToolApprovalRequestOutput<any>[] = [];
    let result = await agent.stream({
      session,
      prompt:
        'Run `echo $HOME` with the bash tool to resolve the home directory path; then write a file `$HOME/testfile.md` with content "Test content." with a single write tool call; once that tool call has completed, make a read tool call to read the contents from the same file.',
    });

    while (true) {
      const pendingApprovals: ToolApprovalRequestOutput<any>[] = [];
      await printFullStream({
        result,
        onError: ({ error }) => {
          throw error;
        },
        onToolApproval: approval => {
          if (!approval.isAutomatic) {
            approvalRequests.push(approval);
            pendingApprovals.push(approval);
          }
        },
      });

      if (pendingApprovals.length === 0) {
        break;
      }

      result = await agent.stream({
        session,
        messages: createToolApprovalResponsesMessages({
          approvals: pendingApprovals,
          approved: true,
        }),
      });
    }

    for (const toolName of ['write', 'view']) {
      if (
        !approvalRequests.some(
          approval =>
            approval.toolCall.toolName === toolName &&
            JSON.stringify(approval.toolCall.input).includes('testfile.md'),
        )
      ) {
        throw new Error(
          `Expected a ${toolName} permission request for $HOME/testfile.md.`,
        );
      }
    }
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
