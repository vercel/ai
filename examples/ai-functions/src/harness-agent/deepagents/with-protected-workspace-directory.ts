import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import type { ToolApprovalRequestOutput } from 'ai';
import { createDeepAgents } from './_create';
import { createToolApprovalResponsesMessages } from '../../lib/harness-tool-approval';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const files = [
  {
    path: '.agents/skills/test/SKILL.md',
    originalText: 'The test skill ran.',
    editedText: 'The edited test skill ran.',
  },
  {
    path: 'TEST.md',
    originalText: 'Original content.',
    editedText: 'Edited content.',
  },
];

run(async () => {
  const agent = new HarnessAgent({
    harness: createDeepAgents(),
    permissionMode: 'allow-edits',
    sandboxConfig: {
      workDir: '.',
      bootstrapHash: 'protected-workspace-directory-v2',
      onBootstrap: async ({ session, workDir, abortSignal }) => {
        await session.writeTextFile({
          path: `${workDir}/${files[0].path}`,
          content: `---
name: test
description: Respond with a fixed confirmation phrase when the user asks to run the test skill.
---

When this skill is used, respond with exactly "${files[0].originalText}"
`,
          abortSignal,
        });
        await session.writeTextFile({
          path: `${workDir}/${files[1].path}`,
          content: `# Test\n\n${files[1].originalText}\n`,
          abortSignal,
        });
      },
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
    const approvalRequests: ToolApprovalRequestOutput<any>[] = [];
    let result = await agent.stream({
      session,
      prompt: `Edit two files in the working directory, using a separate tool call for each file. ${files
        .map(
          file =>
            `In \`${file.path}\`, replace the text \`${file.originalText}\` with \`${file.editedText}\`.`,
        )
        .join(' ')} Do not change anything else.`,
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

    for (const file of files) {
      const content = await sandboxSession.readTextFile({
        path: `${sandboxSession.defaultWorkingDirectory}/${file.path}`,
      });
      if (
        content === null ||
        !content.includes(file.editedText) ||
        content.includes(file.originalText)
      ) {
        throw new Error(`Expected ${file.path} to be edited.`);
      }
    }

    if (approvalRequests.length !== 1) {
      throw new Error(
        `Expected exactly one tool approval request, but received ${approvalRequests.length}.`,
      );
    }
  } catch (error) {
    process.exitCode = 1;
    throw error;
  } finally {
    try {
      await session?.destroy();
    } finally {
      await sandboxSession.destroy();
    }
  }
});
