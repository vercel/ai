import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { execFileSync } from 'node:child_process';
import {
  createVercelSandboxSessionFromNativeSandbox,
  type VercelNativeSandboxSession,
} from '@ai-sdk/sandbox-vercel';
import {
  generateText,
  InvalidArgumentError,
  isStepCount,
  type Experimental_SandboxSession as SandboxSession,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBashTool } from './bash-tool';

async function execute(
  bash: Awaited<ReturnType<typeof createBashTool>>,
  command: string,
) {
  return bash.execute(
    { command },
    { toolCallId: 'test-call', messages: [], context: {} },
  );
}

const sessions: Awaited<
  ReturnType<typeof createJustBashNetworkSandboxSession>
>[] = [];

async function createSandbox(cwd = '/home/test') {
  const session = await createJustBashNetworkSandboxSession({ cwd });
  sessions.push(session);
  return session.restricted();
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.destroy()));
});

describe('createBashTool', () => {
  it('uses the sandbox default without setup commands', async () => {
    const sandbox = await createSandbox();
    const run = vi.spyOn(sandbox, 'run');
    const write = vi.spyOn(sandbox, 'writeTextFile');
    const bash = await createBashTool({ sandbox });

    expect(run).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(bash.description).toContain("sandbox's default working directory");
    expect(await execute(bash, 'pwd')).toEqual({
      stdout: '/home/test\n',
      stderr: '',
      exitCode: 0,
    });
    expect(run).toHaveBeenCalledWith({
      command: 'pwd',
      abortSignal: undefined,
      maxOutputLength: 30_000,
    });
  });

  it('uses a custom sandbox session and forwards cancellation', async () => {
    const session: SandboxSession = {
      description: 'Custom sandbox with Python and network access.',
      run: vi
        .fn()
        .mockResolvedValue({ stdout: 'custom', stderr: '', exitCode: 0 }),
      writeTextFile: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue(null),
      listDirectory: vi.fn().mockResolvedValue(null),
      deleteFile: vi.fn().mockResolvedValue(false),
      readTextFile: vi.fn().mockResolvedValue('report'),
      readFile: vi.fn(),
      readBinaryFile: vi.fn(),
      writeFile: vi.fn(),
      writeBinaryFile: vi.fn(),
      spawn: vi.fn(),
    };
    const bash = await createBashTool({
      sandbox: session,
      workingDirectory: '/app',
    });
    expect(session.writeTextFile).not.toHaveBeenCalled();
    expect(bash.description).toContain(session.description);
    const abortSignal = new AbortController().signal;
    expect(
      await bash.execute(
        { command: 'python script.py' },
        {
          toolCallId: 'test-call',
          messages: [],
          context: {},
          abortSignal,
        },
      ),
    ).toEqual({ stdout: 'custom', stderr: '', exitCode: 0 });
    expect(session.run).toHaveBeenLastCalledWith({
      command: 'python script.py',
      workingDirectory: '/app',
      abortSignal,
      maxOutputLength: 30_000,
    });
  });

  it.each([undefined, '/vercel/sandbox/workspace'])(
    'works with the Vercel Sandbox adapter with workingDirectory %s',
    async workingDirectory => {
      const runCommand = vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: async () => '',
        stderr: async () => '',
        wait: async () => ({ exitCode: 0 }),
        logs: async function* () {
          yield { stream: 'stdout', data: 'vercel output' };
        },
      });
      const writeFiles = vi.fn().mockResolvedValue(undefined);
      const nativeSandbox = {
        name: 'test-vercel-sandbox',
        runCommand,
        writeFiles,
        readFileToBuffer: vi.fn().mockResolvedValue(Buffer.from('report')),
      } as unknown as VercelNativeSandboxSession;
      const bash = await createBashTool({
        sandbox: createVercelSandboxSessionFromNativeSandbox(nativeSandbox),
        workingDirectory,
      });
      expect(writeFiles).not.toHaveBeenCalled();
      expect(await execute(bash, 'cat input.txt')).toEqual({
        stdout: 'vercel output',
        stderr: '',
        exitCode: 0,
      });
      expect(runCommand).toHaveBeenLastCalledWith({
        cmd: 'bash',
        args: ['-c', 'cat input.txt'],
        detached: true,
        ...(workingDirectory === undefined ? {} : { cwd: workingDirectory }),
      });
    },
  );

  it('shares files across tools using the same session without resetting them', async () => {
    const session = await createSandbox();
    await session.writeTextFile({
      path: '/home/test/input.txt',
      content: 'hello',
    });
    const first = await createBashTool({ sandbox: session });
    await execute(first, 'cp input.txt report.txt');
    const second = await createBashTool({ sandbox: session });
    expect(await execute(second, 'cat report.txt')).toEqual({
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
    });
    expect(await session.readTextFile({ path: '/home/test/report.txt' })).toBe(
      'hello',
    );
  });

  it.each(['/custom/work/', "/tmp/it's $(echo literal)", '/'])(
    'initializes and executes in a custom working directory: %s',
    async workingDirectory => {
      const sandbox = await createSandbox();
      const bash = await createBashTool({ sandbox, workingDirectory });
      await sandbox.writeTextFile({
        path: `${workingDirectory}/input.txt`,
        content: 'hello',
      });
      expect(await execute(bash, 'cat input.txt')).toEqual({
        stdout: 'hello',
        stderr: '',
        exitCode: 0,
      });
    },
  );

  it('rejects relative working directories before changing the session', async () => {
    const sandbox = await createSandbox();
    const run = vi.spyOn(sandbox, 'run');
    await expect(
      createBashTool({ sandbox, workingDirectory: 'relative' }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(run).not.toHaveBeenCalled();
  });

  it('fails initialization when the working directory cannot be created', async () => {
    const sandbox = await createSandbox();
    vi.spyOn(sandbox, 'run').mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Permission denied',
    });
    const write = vi.spyOn(sandbox, 'writeTextFile');
    await expect(
      createBashTool({
        sandbox,
        workingDirectory: '/app',
      }),
    ).rejects.toThrow('Permission denied');
    expect(write).not.toHaveBeenCalled();
  });

  it.each([undefined, 1_000])(
    'propagates an aborted command with timeout %s',
    async timeout => {
      const bash = await createBashTool({
        sandbox: await createSandbox(),
        timeout,
      });
      const controller = new AbortController();
      controller.abort(new Error('Cancelled'));
      await expect(
        bash.execute(
          { command: 'echo hello' },
          {
            toolCallId: 'test-call',
            messages: [],
            context: {},
            abortSignal: controller.signal,
          },
        ),
      ).rejects.toThrow('Cancelled');
    },
  );

  it.each([false, true])(
    'times out commands with a caller signal: %s',
    async withCallerSignal => {
      const sandbox = await createSandbox();
      const bash = await createBashTool({ sandbox, timeout: 50 });
      const controller = new AbortController();

      const result = await bash.execute(
        { command: 'sleep 1; echo finished > marker.txt' },
        {
          toolCallId: 'test-call',
          messages: [],
          context: {},
          abortSignal: withCallerSignal ? controller.signal : undefined,
        },
      );

      expect(result).toEqual({ stdout: '', stderr: '', exitCode: 124 });
      expect(await sandbox.readTextFile({ path: 'marker.txt' })).toBeNull();
      expect(controller.signal.aborted).toBe(false);

      // Each execution gets a fresh timeout, even after a previous one expires.
      expect(await execute(bash, 'echo hello')).toEqual({
        stdout: 'hello\n',
        stderr: '',
        exitCode: 0,
      });
    },
  );

  it('preserves caller cancellation before the timeout expires', async () => {
    const sandbox = await createSandbox();
    const controller = new AbortController();
    const reason = new Error('Cancelled by caller');
    vi.spyOn(sandbox, 'run').mockImplementation(async ({ abortSignal }) => {
      const aborted = new Promise<never>((_, reject) => {
        abortSignal!.addEventListener(
          'abort',
          () => reject(abortSignal!.reason),
          { once: true },
        );
      });
      controller.abort(reason);
      return aborted;
    });
    const bash = await createBashTool({ sandbox, timeout: 1_000 });

    await expect(
      bash.execute(
        { command: 'sleep 1' },
        {
          toolCallId: 'test-call',
          messages: [],
          context: {},
          abortSignal: controller.signal,
        },
      ),
    ).rejects.toBe(reason);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2_147_483_648])(
    'rejects an invalid timeout before changing the session: %s',
    async timeout => {
      const sandbox = await createSandbox();
      const run = vi.spyOn(sandbox, 'run');
      await expect(
        createBashTool({ sandbox, workingDirectory: '/app', timeout }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        parameter: 'timeout',
      });
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('executes pipelines against existing files and exposes generated files', async () => {
    const sandbox = await createSandbox();
    await sandbox.writeTextFile({
      path: '/home/test/data/words.txt',
      content: 'pear\napple\npear\n',
    });
    const bash = await createBashTool({ sandbox });

    expect(
      await execute(bash, 'cat data/words.txt | sort | uniq > report.txt'),
    ).toEqual({ stdout: '', stderr: '', exitCode: 0 });
    expect(await sandbox.readTextFile({ path: '/home/test/report.txt' })).toBe(
      'apple\npear\n',
    );
    expect(await execute(bash, 'cat report.txt')).toEqual({
      stdout: 'apple\npear\n',
      stderr: '',
      exitCode: 0,
    });
  });

  it('keeps separate sessions independent', async () => {
    const first = await createBashTool({ sandbox: await createSandbox() });
    const second = await createBashTool({ sandbox: await createSandbox() });

    await execute(first, 'echo private > private.txt');

    expect(await execute(second, 'test -e private.txt')).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
  });

  it('resets shell state between calls while preserving files', async () => {
    const bash = await createBashTool({ sandbox: await createSandbox() });

    await execute(
      bash,
      'mkdir subdir; cd subdir; export NAME=value; touch saved',
    );

    expect(
      await execute(
        bash,
        'pwd; printf "name=%s\\n" "$NAME"; test -f subdir/saved',
      ),
    ).toEqual({ stdout: '/home/test\nname=\n', stderr: '', exitCode: 0 });
  });

  it('preserves stderr and nonzero exit codes for model recovery', async () => {
    const bash = await createBashTool({ sandbox: await createSandbox() });

    expect(
      await execute(bash, 'echo partial; echo failure >&2; exit 7'),
    ).toEqual({ stdout: 'partial\n', stderr: 'failure\n', exitCode: 7 });
  });

  it('applies the configured output limit to both streams', async () => {
    const bash = await createBashTool({
      sandbox: await createSandbox(),
      maxOutputLength: 4,
    });

    expect(
      await execute(bash, 'printf 123456789; printf abcdefghi >&2'),
    ).toEqual({
      stdout: '1234\n[Output truncated: 5 characters omitted.]',
      stderr: 'abcd\n[Output truncated: 5 characters omitted.]',
      exitCode: 0,
    });
  });

  it('uses the default output limit', async () => {
    const sandbox = await createSandbox();
    await sandbox.writeTextFile({
      path: '/home/test/large.txt',
      content: 'x'.repeat(30_001),
    });
    const bash = await createBashTool({ sandbox });

    expect(await execute(bash, 'cat large.txt')).toEqual({
      stdout: `${'x'.repeat(30_000)}\n[Output truncated: 1 characters omitted.]`,
      stderr: '',
      exitCode: 0,
    });
  });

  it('uses original lengths from a sandbox that bounds both output streams', async () => {
    const sandbox = await createSandbox();
    vi.spyOn(sandbox, 'run').mockImplementation(async () => ({
      stdout: '1234',
      stderr: 'abcd',
      stdoutLength: 9,
      stderrLength: 12,
      exitCode: 7,
    }));
    const bash = await createBashTool({ sandbox, maxOutputLength: 4 });
    expect(await execute(bash, 'command')).toEqual({
      stdout: '1234\n[Output truncated: 5 characters omitted.]',
      stderr: 'abcd\n[Output truncated: 8 characters omitted.]',
      exitCode: 7,
    });
  });

  it('still truncates output from older sandboxes that ignore the limit', async () => {
    const sandbox = await createSandbox();
    vi.spyOn(sandbox, 'run').mockResolvedValue({
      stdout: 'a😀b',
      stderr: '12345',
      exitCode: 0,
    });
    const bash = await createBashTool({ sandbox, maxOutputLength: 2 });
    expect(await execute(bash, 'command')).toEqual({
      stdout: 'a\ud83d\n[Output truncated: 2 characters omitted.]',
      stderr: '12\n[Output truncated: 3 characters omitted.]',
      exitCode: 0,
    });
  });

  it('does not retain a legacy sandbox result behind the truncated output', () => {
    const source = new URL('./bash-tool.ts', import.meta.url);
    const growth = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--expose-gc', '--input-type=module'],
      {
        encoding: 'utf8',
        input: `
          import { createBashTool } from ${JSON.stringify(source.href)};
          const tool = await createBashTool({ sandbox: {
            description: 'legacy sandbox',
            async run() {
              const stdout = 'x'.repeat(32 * 1024 * 1024);
              Buffer.byteLength(stdout);
              return { stdout, stderr: '', exitCode: 0 };
            },
          }});
          globalThis.gc();
          const baseline = process.memoryUsage().heapUsed;
          const result = await tool.execute({ command: 'large output' }, {});
          await new Promise(resolve => setImmediate(resolve));
          globalThis.gc();
          console.log(process.memoryUsage().heapUsed - baseline);
          if (result.stdout.length !== 30_049) process.exit(1);
        `,
      },
    );
    expect(Number(growth.trim())).toBeLessThan(4 * 1024 * 1024);
  });

  it('leaves output at the limit unchanged', async () => {
    const bash = await createBashTool({
      sandbox: await createSandbox(),
      maxOutputLength: 4,
    });

    expect(await execute(bash, 'printf 1234')).toEqual({
      stdout: '1234',
      stderr: '',
      exitCode: 0,
    });
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects an invalid output limit: %s',
    async maxOutputLength => {
      await expect(
        createBashTool({ sandbox: await createSandbox(), maxOutputLength }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
    },
  );

  it('executes as a function tool in the standard AI SDK loop', async () => {
    const sandbox = await createSandbox();
    await sandbox.writeTextFile({
      path: '/home/test/message.txt',
      content: 'hello from bash',
    });
    const bash = await createBashTool({ sandbox });
    const usage = {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'read-message',
              toolName: 'bash',
              input: JSON.stringify({ command: 'cat message.txt' }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
          warnings: [],
        },
        {
          content: [{ type: 'text', text: 'The file says hello from bash.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        },
      ],
    });

    const result = await generateText({
      model,
      tools: { bash },
      prompt: 'Read message.txt.',
      stopWhen: isStepCount(2),
    });

    expect(result.text).toBe('The file says hello from bash.');
    expect(result.steps[0].toolResults[0].output).toEqual({
      stdout: 'hello from bash',
      stderr: '',
      exitCode: 0,
    });
    expect(model.doGenerateCalls[0].tools).toEqual([
      expect.objectContaining({ type: 'function', name: 'bash' }),
    ]);
    expect(model.doGenerateCalls[1].prompt).toContainEqual({
      role: 'tool',
      content: [
        expect.objectContaining({
          type: 'tool-result',
          toolCallId: 'read-message',
          toolName: 'bash',
          output: {
            type: 'json',
            value: { stdout: 'hello from bash', stderr: '', exitCode: 0 },
          },
        }),
      ],
    });
  });
});
