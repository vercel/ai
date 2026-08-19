import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';

type Frame = {
  type?: string;
  usage?: unknown;
  totalUsage?: unknown;
};

const FAILURE_SIGNAL =
  'ISSUE #19068 REPRODUCED: final finish-step usage equals cumulative finish totalUsage';

async function main() {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const packageDirectory = resolve(
    repositoryRoot,
    'packages/harness-claude-code',
  );
  const temporaryRoot = resolve(repositoryRoot, '.reproduction');
  await mkdir(temporaryRoot, { recursive: true });
  const runDirectory = await mkdtemp(`${temporaryRoot}/issue-19068-`);
  const workdir = resolve(runDirectory, 'workdir');
  const bridgeStateDirectory = resolve(runDirectory, 'bridge-state');
  await mkdir(workdir, { recursive: true });
  await mkdir(bridgeStateDirectory, { recursive: true });

  const token = 'issue-19068-reproduction';
  let child: ChildProcess | undefined;
  let socket: WebSocket | undefined;

  try {
    child = spawn(
      'pnpm',
      [
        'exec',
        'tsx',
        'src/bridge/index.ts',
        '--workdir',
        workdir,
        '--bridge-state-dir',
        bridgeStateDirectory,
      ],
      {
        cwd: packageDirectory,
        env: {
          ...process.env,
          BRIDGE_CHANNEL_TOKEN: token,
          BRIDGE_WS_PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const stderr: string[] = [];
    child.stderr?.on('data', chunk => stderr.push(chunk.toString()));

    const port = await waitForBridgePort(child, stderr);
    socket = new WebSocket(
      `ws://127.0.0.1:${port}/?agent_bridge_token=${token}`,
    );
    const frames: Frame[] = [];

    await new Promise<void>((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for the Claude Code bridge turn.'));
      }, 120_000);

      socket!.on('error', reject);
      socket!.on('message', raw => {
        const frame = JSON.parse(raw.toString()) as Frame;
        frames.push(frame);

        if (frame.type === 'bridge-hello') {
          socket!.send(
            JSON.stringify({
              type: 'start',
              prompt:
                'Use the Bash tool exactly once to run `printf 19068`, then reply with only the text done.',
              thinking: { type: 'disabled' },
              maxTurns: 3,
              permissionMode: 'allow-all',
              builtinToolFiltering: {
                mode: 'allow',
                toolNames: ['bash'],
              },
            }),
          );
        }

        if (frame.type === 'error') {
          clearTimeout(timeout);
          reject(
            new Error(`Claude Code bridge error: ${JSON.stringify(frame)}`),
          );
        }

        if (frame.type === 'finish') {
          clearTimeout(timeout);
          resolvePromise();
        }
      });
    });

    const finishSteps = frames.filter(frame => frame.type === 'finish-step');
    const finish = frames.find(frame => frame.type === 'finish');

    if (finishSteps.length < 2) {
      throw new Error(
        `Expected a tool round trip with at least two finish-step events, received ${finishSteps.length}.`,
      );
    }
    if (finish?.totalUsage == null) {
      throw new Error('The bridge did not emit finish.totalUsage.');
    }

    const finalStepUsage = finishSteps.at(-1)?.usage;
    const finalStepEqualsTurnTotal =
      JSON.stringify(finalStepUsage) === JSON.stringify(finish.totalUsage);

    console.log(
      JSON.stringify(
        {
          finishStepCount: finishSteps.length,
          firstStepUsage: finishSteps[0].usage,
          finalStepUsage,
          totalUsage: finish.totalUsage,
        },
        null,
        2,
      ),
    );

    if (finalStepEqualsTurnTotal) {
      throw new Error(FAILURE_SIGNAL);
    }

    console.log(
      'PASS: the final finish-step reports usage distinct from cumulative finish.totalUsage.',
    );
  } finally {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stop' }));
    }
    socket?.terminate();
    await stopChild(child);
    await rm(runDirectory, { recursive: true, force: true });
  }
}

async function waitForBridgePort(
  child: ChildProcess,
  stderr: string[],
): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    let stdout = '';
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for bridge-ready. stderr: ${stderr.join('')}`,
        ),
      );
    }, 30_000);

    child.once('exit', code => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Claude Code bridge exited before ready with code ${code}. stderr: ${stderr.join('')}`,
        ),
      );
    });
    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
      const lines = stdout.split('\n');
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line) as { type?: string; port?: number };
        if (
          message.type === 'bridge-ready' &&
          typeof message.port === 'number'
        ) {
          clearTimeout(timeout);
          resolvePromise(message.port);
        }
      }
    });
  });
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (child == null || child.exitCode != null) return;

  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>(resolvePromise => {
      child.once('exit', () => resolvePromise());
    }),
    new Promise<void>(resolvePromise => {
      setTimeout(() => {
        if (child.exitCode == null) child.kill('SIGKILL');
        resolvePromise();
      }, 2_000);
    }),
  ]);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
