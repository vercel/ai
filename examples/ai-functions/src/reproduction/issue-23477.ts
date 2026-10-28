import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

async function main() {
  const rawEvents: HarnessV1StreamPart[] = [];
  const harness = createClaudeCode();
  const agent = new HarnessAgent({
    harness: {
      ...harness,
      async doStart(options) {
        const runtime = await harness.doStart(options);
        return {
          ...runtime,
          doPromptTurn(turn) {
            return runtime.doPromptTurn({
              ...turn,
              emit(event) {
                rawEvents.push(event);
                console.log('HARNESS_EVENT', JSON.stringify(event));
                turn.emit(event);
              },
            });
          },
        };
      },
    },
    permissionMode: 'allow-reads',
  });
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 120_000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt: 'Run the shell command `echo hello`',
    });
    let approvalCount = 0;
    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        throw part.error;
      }
      if (part.type !== 'tool-approval-request') {
        continue;
      }
      approvalCount++;
      console.log(JSON.stringify(part));
      if (process.env.RECORD_ISSUE_23477 === '1') {
        const fixture = new URL(
          '../../../../packages/harness/src/agent/internal/__fixtures__/issue-23477.json',
          import.meta.url,
        );
        await mkdir(new URL('.', fixture), { recursive: true });
        await writeFile(
          fixture,
          JSON.stringify({ rawEvents, approval: part }, null, 2) + '\n',
        );
      }
      // A native-name-aware gate must identify the tool from the request alone.
      // Accept either native naming or added metadata, not just the proposed fix.
      const request = JSON.stringify(part);
      if (
        !['Bash', 'Write', 'Edit'].some(name => request.includes(`"${name}"`))
      ) {
        throw new Error(
          'ISSUE-23477: approval gate cannot identify the native tool from the approval request',
        );
      }
    }
    if (approvalCount === 0) {
      throw new Error(
        'Scenario incomplete: no built-in tool approval received',
      );
    }
    console.log('Native tool identifiable from the approval request');
  } finally {
    try {
      await session?.destroy();
    } finally {
      await sandboxSession.destroy();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
