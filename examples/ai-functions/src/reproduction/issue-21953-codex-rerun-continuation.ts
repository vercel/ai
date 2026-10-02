import { createCodex } from '@ai-sdk/harness-codex';
import assert from 'node:assert/strict';
import { WebSocketServer, type WebSocket } from 'ws';

const reproducedSignal =
  'ISSUE #21953 REPRODUCED: rerun recovery emitted repeated start frames';

class ReproducedBugError extends Error {}

type Frame = {
  type?: unknown;
  prompt?: unknown;
};

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text.length > 0) {
        controller.enqueue(new TextEncoder().encode(text));
      }
      controller.close();
    },
  });
}

async function waitFor(
  predicate: () => boolean,
  message: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(message);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function createRecoveredSession(
  recovery: 'continue' | 'prompt',
): Promise<{
  frames: Frame[];
  session: Awaited<ReturnType<ReturnType<typeof createCodex>['doStart']>>;
  close: () => Promise<void>;
}> {
  const frames: Frame[] = [];
  const sockets = new Set<WebSocket>();
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('message', data => {
      frames.push(JSON.parse(data.toString()) as Frame);
    });
  });

  const files = new Map<string, string>();
  const harness = createCodex({
    auth: {},
    port,
    portEndpoint: { url: `ws://127.0.0.1:${port}` },
  });
  const sandboxSession = {
    defaultWorkingDirectory: '/work',
    run: async ({ command }: { command: string }) => ({
      exitCode: 0,
      stdout: command === 'printf "%s" "$HOME"' ? '/home/reproduction\n' : '',
      stderr: '',
    }),
    readTextFile: async ({ path }: { path: string }) => files.get(path) ?? null,
    writeTextFile: async ({
      path,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      files.set(path, content);
    },
    spawn: async () => ({
      stdout: textStream(`${JSON.stringify({ type: 'bridge-ready', port })}\n`),
      stderr: textStream(''),
      kill: async () => {},
      wait: async () => ({ exitCode: 0 }),
    }),
  } as unknown as Parameters<typeof harness.doStart>[0]['sandboxSession'];

  const lifecycleState = {
    harnessId: 'codex',
    specificationVersion: 'harness-v1' as const,
    data: { threadId: 'thread-21953' },
  };
  const session = await harness.doStart({
    sessionId: `issue-21953-${recovery}`,
    sandboxSession,
    sessionWorkDir: '/work/codex-issue-21953',
    ...(recovery === 'continue'
      ? {
          continueFrom: {
            ...lifecycleState,
            type: 'continue-turn' as const,
          },
        }
      : {
          resumeFrom: {
            ...lifecycleState,
            type: 'resume-session' as const,
          },
        }),
  });

  return {
    frames,
    session,
    close: async () => {
      await session.doDestroy();
      for (const socket of sockets) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function startFrames(frames: Frame[]): Frame[] {
  return frames.filter(frame => frame.type === 'start');
}

async function runDoubleContinuationScenario(): Promise<Frame[]> {
  const recovered = await createRecoveredSession('continue');
  try {
    const first = await recovered.session.doContinueTurn({
      skills: [],
      tools: [],
      emit: () => {},
    });
    void Promise.resolve(first.done).catch(() => {});
    await waitFor(
      () => startFrames(recovered.frames).length >= 1,
      'first recovered continuation did not send its rerun start frame',
    );

    const second = await recovered.session.doContinueTurn({
      skills: [],
      tools: [],
      emit: () => {},
    });
    void Promise.resolve(second.done).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 50));

    return startFrames(recovered.frames);
  } finally {
    await recovered.close();
  }
}

async function runPromptThenContinuationScenario(): Promise<Frame[]> {
  const recovered = await createRecoveredSession('prompt');
  try {
    const prompt = await recovered.session.doPromptTurn({
      prompt: 'Recovered prompt',
      skills: [],
      tools: [],
      emit: () => {},
    });
    void Promise.resolve(prompt.done).catch(() => {});
    await waitFor(
      () => startFrames(recovered.frames).length >= 1,
      'recovered prompt did not send its start frame',
    );

    const continuation = await recovered.session.doContinueTurn({
      skills: [],
      tools: [],
      emit: () => {},
    });
    void Promise.resolve(continuation.done).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 50));

    return startFrames(recovered.frames);
  } finally {
    await recovered.close();
  }
}

async function main(): Promise<void> {
  const doubleContinuation = await runDoubleContinuationScenario();
  const promptThenContinuation = await runPromptThenContinuationScenario();

  const scenarios = [
    ['two continuations', doubleContinuation],
    ['prompt then continuation', promptThenContinuation],
  ] as const;

  for (const [name, starts] of scenarios) {
    if (starts.length === 0) {
      throw new Error(`${name}: no start frame was emitted`);
    }
  }

  const repeated = scenarios.filter(([, starts]) => starts.length > 1);
  if (repeated.length > 0) {
    const details = repeated
      .map(
        ([name, starts]) =>
          `${name} emitted ${starts.length} starts (${starts
            .map(frame => JSON.stringify(frame.prompt))
            .join(', ')})`,
      )
      .join('; ');
    throw new ReproducedBugError(`${reproducedSignal}: ${details}`);
  }

  for (const [name, starts] of scenarios) {
    assert.equal(
      starts.length,
      1,
      `${name}: expected exactly one recovery start`,
    );
  }
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  console.error('ISSUE #21953 REPRODUCTION HARNESS ERROR', error);
  process.exitCode = 2;
});
