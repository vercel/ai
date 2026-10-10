import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { WebSocketServer } from 'ws';
import { createClaudeCode } from '../../../../packages/harness-claude-code/src/index';

const failureSignal =
  'ISSUE_22549_REPRODUCED: approved resumed tool continuation restarted the turn instead of resolving the pending approval';

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function main(): Promise<void> {
  const results = await Promise.all([
    runScenario('continue'),
    runScenario('prompt'),
  ]);
  const failures = results.filter(
    result => result.startCount !== 1 || !result.approvalAccepted,
  );
  if (failures.length > 0) {
    throw new Error(
      `${failureSignal}: ${failures
        .map(
          result =>
            `${result.firstAction}-first startCount=${result.startCount} approvalAccepted=${result.approvalAccepted}`,
        )
        .join(', ')}`,
    );
  }
}

async function runScenario(firstAction: 'continue' | 'prompt'): Promise<{
  firstAction: 'continue' | 'prompt';
  startCount: number;
  approvalAccepted: boolean;
}> {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to allocate the fake bridge port.');
  }

  let startCount = 0;
  let approvalPending = false;
  let approvalAccepted = false;
  let resolveProcessWait: (() => void) | undefined;
  const processWait = new Promise<void>(resolve => {
    resolveProcessWait = resolve;
  });

  server.on('connection', socket => {
    socket.send(
      JSON.stringify({
        type: 'bridge-hello',
        state: 'waiting',
        lastSeq: 0,
      }),
    );

    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as {
        type?: string;
        approved?: boolean;
      };

      if (message.type === 'start') {
        startCount += 1;
        if (startCount === 1) {
          // The rerun start re-drives the resumed thread to its pending tool
          // approval. A later start aborts that live approval, matching the
          // Claude Code bridge behavior reported in the issue.
          approvalPending = true;
        } else if (approvalPending) {
          approvalPending = false;
        }
      }

      if (
        message.type === 'tool-approval-response' &&
        message.approved === true &&
        approvalPending
      ) {
        approvalAccepted = true;
        approvalPending = false;
      }

      if (message.type === 'destroy') {
        resolveProcessWait?.();
      }
    });
  });

  const sandboxCore = {
    description: 'Local fake network sandbox for issue #22549',
    run: async ({ command }: { command: string }) => ({
      exitCode: 0,
      stdout: command === 'printf "%s" "$HOME"' ? '/tmp/fake-home' : '',
      stderr: '',
    }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async () => ({
      stdout: textStream(
        `${JSON.stringify({ type: 'bridge-ready', port: address.port })}\n`,
      ),
      stderr: textStream(''),
      wait: async () => {
        await processWait;
        return { exitCode: 0 };
      },
      kill: async () => {
        resolveProcessWait?.();
      },
    }),
  };
  const sandboxSession = {
    ...sandboxCore,
    id: 'issue-22549-sandbox',
    defaultWorkingDirectory: '/tmp/workspace',
    ports: [address.port],
    restricted: () => sandboxCore,
    getPortEndpoint: async () => ({
      url: `ws://127.0.0.1:${address.port}`,
    }),
    getPortUrl: async () => `ws://127.0.0.1:${address.port}`,
    stop: async () => {},
    destroy: async () => {},
  } as unknown as HarnessV1NetworkSandboxSession;

  const harness = createClaudeCode({ startupTimeoutMs: 5_000 });
  const session = await harness.doStart({
    sessionId: `issue-22549-${firstAction}`,
    sandboxSession,
    sessionWorkDir: `/tmp/workspace/claude-code-issue-22549-${firstAction}`,
    resumeFrom: {
      type: 'resume-session',
      harnessId: 'claude-code',
      specificationVersion: 'harness-v1',
      data: {},
    },
  });

  try {
    const resumedTurn =
      firstAction === 'continue'
        ? await session.doContinueTurn({
            skills: [],
            tools: [],
            emit: () => {},
          })
        : await session.doPromptTurn({
            prompt: 'Resume the saved session.',
            skills: [],
            tools: [],
            emit: () => {},
          });
    void Promise.resolve(resumedTurn.done).catch(() => {});

    const approvalContinuation = await session.doContinueTurn({
      skills: [],
      tools: [],
      emit: () => {},
    });
    void Promise.resolve(approvalContinuation.done).catch(() => {});
    await approvalContinuation.submitToolApproval?.({
      approvalId: 'approval-1',
      approved: true,
    });

    await new Promise(resolve => setTimeout(resolve, 25));

    return { firstAction, startCount, approvalAccepted };
  } finally {
    await session.doDestroy();
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
