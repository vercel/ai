import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import type { ToolApprovalRequestOutput } from 'ai';
import { createToolApprovalResponsesMessages } from '../../lib/harness-tool-approval';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createCodexACP } from './_create';

const repoHookMarker = 'REPO_CONFIG_ISOLATION_PRE_TOOL_USE';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    permissionMode: 'allow-reads',
    sandboxConfig: {
      workDir: 'repo-config-isolation',
      bootstrapHash: 'repo-config-isolation-codex-acp-diagnostic-20261105',
      onBootstrap: async ({ session, workDir, abortSignal }) => {
        const files = [
          {
            path: 'AGENTS.md',
            content:
              'The user is French, so you must always respond in French.',
          },
          { path: '.codex/config.toml', content: '' },
          {
            path: '.codex/hooks.json',
            content: JSON.stringify(
              {
                hooks: {
                  PreToolUse: [
                    {
                      hooks: [
                        {
                          type: 'command',
                          command: `printf '%s\\n' '${repoHookMarker}' >&2`,
                        },
                        {
                          type: 'command',
                          command: `printf '%s\\n' '${repoHookMarker}' >> "${workDir}/repo-config-hook.log"`,
                        },
                      ],
                    },
                  ],
                },
              },
              null,
              2,
            ),
          },
          {
            path: '.agents/skills/get-stock-price/SKILL.md',
            content: `---
name: get-stock-price
description: Look up stock prices for GOOG, MSFT, AAPL, and TSLA using fictional reference data.
---

For stock price lookup, only refer to the data in this skill. Never use any kind of web search to get a stock price.

- GOOG: 123.45 USD
- MSFT: 234.56 USD
- AAPL: 345.67 USD
- TSLA: 456.78 USD
`,
          },
        ];

        for (const file of files) {
          await session.writeTextFile({
            path: `${workDir}/${file.path}`,
            content: file.content,
            abortSignal,
          });
        }
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
    let sawWriteApproval = false;
    let result = await agent.stream({
      session,
      prompt:
        'What is the current value of GOOG? Use the `get-stock-price` skill. Write the result to a `goog-price.md` file in the working directory, then respond to me with the current value and a confirmation that you wrote the file.',
    });

    while (true) {
      const pendingApprovals: ToolApprovalRequestOutput<any>[] = [];
      await printFullStream({
        result,
        onError: ({ error }) => {
          throw error;
        },
        onToolApproval: approval => {
          if (approval.isAutomatic) {
            return;
          }

          pendingApprovals.push(approval);
          if (
            approval.toolCall.toolName === 'write' &&
            JSON.stringify(approval.toolCall.input).includes('goog-price.md')
          ) {
            sawWriteApproval = true;
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

    if (!sawWriteApproval) {
      throw new Error(
        'Expected a non-automatic write tool approval request for goog-price.md.',
      );
    }

    // A marker proves this diagnostic hook ran.
    const hookLog = await sandboxSession.readTextFile({
      path: `${sandboxSession.defaultWorkingDirectory}/repo-config-isolation/repo-config-hook.log`,
    });
    if (hookLog !== null) {
      throw new Error(
        'Repository configuration was not isolated: the PreToolUse hook marker file exists.',
      );
    }

    const reply = await result.text;
    if (
      !/(?<![\p{L}\p{M}\p{N}_])(?:ce|vaut|du|dans)(?![\p{L}\p{M}\p{N}_])/iu.test(
        reply,
      )
    ) {
      throw new Error('The agent did not respond in French as expected.');
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
