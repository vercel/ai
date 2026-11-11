import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import type { ToolApprovalRequestOutput } from 'ai';
import { createClaudeCode } from './_create';
import { createToolApprovalResponsesMessages } from '../../lib/harness-tool-approval';
import { run } from '../../lib/run';

// Requires Vercel Sandbox credentials and Claude Code authentication, plus
// a provider/model that supports Claude Code's auto permission mode.
run(async () => {
  const agent = new HarnessAgent({
    harness: createClaudeCode({ autoMode: true, maxTurns: 5 }),
    model: 'claude-sonnet-4-6',
    permissionMode: 'allow-reads',
  });
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 5 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    let result = await agent.stream({
      session,
      prompt:
        'Run pwd using Bash, then write auto-mode-demo.txt containing hello. Summarize what you did. If permission is denied, stop.',
    });
    let approvalRounds = 0;
    for (;;) {
      const approvals: ToolApprovalRequestOutput<any>[] = [];
      for await (const part of result.stream) {
        if (part.type === 'raw') {
          // init/status report the actual CLI mode, not just the requested mode.
          const raw = part.rawValue as {
            type?: string;
            subtype?: string;
            permissionMode?: string;
          };
          if (
            raw.type === 'system' &&
            (raw.subtype === 'init' || raw.subtype === 'status')
          ) {
            console.log('Claude Code status:', raw);
          }
        } else if (part.type === 'tool-result') {
          console.log('Tool result:', part.toolName, part.output);
        } else if (part.type === 'tool-approval-request') {
          console.log('Classifier escalated:', part.toolCall);
          approvals.push(part);
        } else if (part.type === 'text-delta') {
          process.stdout.write(part.text);
        } else if (part.type === 'error') {
          throw part.error;
        }
      }
      if (approvals.length === 0) break;
      if (++approvalRounds > 3) {
        throw new Error('Stopped after repeated classifier escalations.');
      }
      // This example conservatively denies escalations. A real host can ask
      // its user and send their decision using the same approval-response API.
      result = await agent.stream({
        session,
        messages: createToolApprovalResponsesMessages({
          approvals,
          approved: false,
          reason: 'The example denies calls the classifier escalates.',
        }),
      });
    }
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
