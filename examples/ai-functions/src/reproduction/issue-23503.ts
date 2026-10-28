import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const failureSignal =
  'ISSUE_23503: stream remained open at the built-in approval boundary with a host tool in the same message';

async function main(): Promise<void> {
  // Keep Node alive through unref'ed sandbox/template polling timers. A setup
  // failure must not accidentally exit successfully before assertions run.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await reproduce();
  } finally {
    clearInterval(keepAlive);
  }
}

async function reproduce(): Promise<void> {
  if (!process.argv.includes('--live')) {
    // Replay recorded live bridge frames through the real Claude Code adapter.
    const replay = spawnSync(
      'pnpm',
      [
        '-C',
        'packages/harness-claude-code',
        'test:node',
        'src/claude-code-harness.test.ts',
        '-t',
        'issue 23503',
      ],
      { cwd: root, stdio: 'inherit' },
    );
    if (replay.error) throw replay.error;
    process.exitCode = replay.status ?? 1;
    return;
  }

  const harness = createClaudeCode();
  const events: unknown[] = [];
  const submissions: unknown[] = [];
  let hostExecutions = 0;
  let bashCallSeen = false;
  let hostCallSeen = false;
  let pauseRequested = false;
  const start = harness.doStart.bind(harness);
  harness.doStart = async options => {
    const session = await start(options);
    const prompt = session.doPromptTurn.bind(session);
    session.doPromptTurn = async options => {
      const control = await prompt({
        ...options,
        emit: event => {
          events.push(event);
          if (event.type === 'tool-call') {
            bashCallSeen ||= event.toolName === 'bash';
            hostCallSeen ||= event.toolName === 'listProjectTickets';
          }
          pauseRequested ||=
            event.type === 'finish-step' &&
            event.finishReason.raw === 'host-input';
          console.log('bridge', JSON.stringify(event));
          options.emit(event);
        },
      });
      const submit = control.submitToolResult.bind(control);
      control.submitToolResult = async submission => {
        submissions.push(submission);
        await submit(submission);
      };
      return control;
    };
    return session;
  };
  const agent = new HarnessAgent({
    harness,
    permissionMode: 'allow-reads',
    toolApproval: { listProjectTickets: 'approved' },
    tools: {
      listProjectTickets: tool({
        inputSchema: z.object({}),
        execute: async () => {
          hostExecutions++;
          return [{ id: '23503' }];
        },
      }),
    },
  });
  const sandbox = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 120000,
    abortSignal: AbortSignal.timeout(90000),
    template: await agent.getSandboxTemplate(),
  });
  const abort = new AbortController();
  let session: HarnessAgentSession | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    session = await agent.createSession({ sandboxSession: sandbox });
    const result = await agent.stream({
      session,
      prompt:
        'In one assistant message call Bash with mkdir -p /tmp/issue-23503 and then listProjectTickets. Emit both tool calls together before waiting for their results.',
      abortSignal: abort.signal,
    });
    let approvalSeen = false;
    const consume = (async () => {
      for await (const part of result.fullStream) {
        if (part.type === 'error') throw part.error;
        if (part.type === 'abort') {
          throw new Error('Live provider turn was unexpectedly aborted.');
        }
        if (
          part.type === 'tool-approval-request' &&
          part.toolCall.toolName === 'bash'
        ) {
          approvalSeen = true;
        }
        console.log('consumer', JSON.stringify(part));
      }
    })();
    const outcome = await Promise.race([
      consume.then(() => 'closed'),
      new Promise<string>(resolve => {
        timer = setTimeout(() => resolve('open'), 30000);
      }),
    ]);
    if (process.argv.includes('--record')) {
      await writeFile(
        `${root}packages/harness-claude-code/src/__fixtures__/issue-23503.json`,
        `${JSON.stringify({ events, submissions, hostExecutions, outcome }, null, 2)}\n`,
      );
    }
    console.log(`Live outcome: ${outcome}; host executions: ${hostExecutions}`);
    if (!approvalSeen) {
      throw new Error('Setup: the model did not request Bash approval.');
    }
    if (outcome !== 'closed') {
      if (!bashCallSeen || !hostCallSeen || !pauseRequested) {
        throw new Error(
          'Setup: the model did not produce the reported mixed-tool pause.',
        );
      }
      throw new Error(failureSignal);
    }
  } finally {
    clearTimeout(timer);
    abort.abort();
    try {
      await session?.destroy();
    } finally {
      await sandbox.destroy();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
