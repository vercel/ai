import { describe, expect, test } from 'vitest';
import type { FxToolSandbox } from './fx-builtin-tools';
import { readFxSandboxHome } from './fx-sandbox-home';

/**
 * Fake sandbox session whose single command prints what a test scripts, and
 * that records the commands it runs and the commands it kills.
 */
function createFakeSession(options: {
  /**
   * Output of the command.
   */
  stdout?: string;
  /**
   * Exit code of the command.
   */
  exitCode?: number;
  /**
   * Whether starting the command fails.
   */
  spawnFails?: boolean;
}) {
  const calls: string[] = [];
  const state = { kills: 0 };
  const stream = (text: string) => {
    const chunks = [new Uint8Array(Buffer.from(text, 'utf8'))];
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk == null) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });
  };
  // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
  const session = {
    description: 'fake sandbox',
    async spawn({ command }: { command: string }) {
      calls.push(command);
      if (options.spawnFails) throw new Error('sandbox unavailable');
      return {
        stdout: stream(options.stdout ?? ''),
        stderr: stream(''),
        async wait() {
          return { exitCode: options.exitCode ?? 0 };
        },
        async kill() {
          state.kills++;
        },
      };
    },
  } as unknown as FxToolSandbox['session'];
  return { session, calls, state };
}

describe('readFxSandboxHome', () => {
  test('returns the home directory the sandbox prints', async () => {
    const { session, calls } = createFakeSession({
      stdout: ' /home/user \n',
    });

    expect(await readFxSandboxHome({ session, workDir: '/' })).toBe(
      '/home/user',
    );
    expect(calls).toEqual(['printf %s "$HOME"']);
  });

  test('has no home when the command fails', async () => {
    const { session } = createFakeSession({
      stdout: '/home/user',
      exitCode: 1,
    });

    expect(await readFxSandboxHome({ session, workDir: '/' })).toBeUndefined();
  });

  test('has no home when the command prints nothing', async () => {
    const { session } = createFakeSession({ stdout: '  \n' });

    expect(await readFxSandboxHome({ session, workDir: '/' })).toBeUndefined();
  });

  test('has no home when the sandbox cannot start the command', async () => {
    const { session } = createFakeSession({ spawnFails: true });

    expect(await readFxSandboxHome({ session, workDir: '/' })).toBeUndefined();
  });

  test('keeps a bounded read of the value and stops the command', async () => {
    const { session, state } = createFakeSession({
      stdout: `/${'a'.repeat(64 * 1024)}`,
    });

    expect(await readFxSandboxHome({ session, workDir: '/' })).toBeUndefined();
    expect(state.kills).toBeGreaterThan(0);
  });
});
