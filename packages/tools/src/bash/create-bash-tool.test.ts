import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
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
import { createBashTool } from './create-bash-tool';

async function execute(
  bash: Awaited<ReturnType<typeof createBashTool>>['bash'],
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

async function createSandbox() {
  const session = await createJustBashNetworkSandboxSession();
  sessions.push(session);
  return session.restricted();
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.destroy()));
});

describe('createBashTool', () => {
  it('uses a custom sandbox session and forwards cancellation', async () => {
    const session: SandboxSession = {
      description: 'Custom sandbox with Python and network access.',
      run: vi
        .fn()
        .mockResolvedValue({ stdout: 'custom', stderr: '', exitCode: 0 }),
      writeTextFile: vi.fn().mockResolvedValue(undefined),
      readTextFile: vi.fn().mockResolvedValue('report'),
      readFile: vi.fn(),
      readBinaryFile: vi.fn(),
      writeFile: vi.fn(),
      writeBinaryFile: vi.fn(),
      spawn: vi.fn(),
    };
    const { bash, sandbox } = await createBashTool({
      sandbox: session,
      workingDirectory: '/app',
      files: { 'nested/input.txt': 'input' },
    });
    expect(session.writeTextFile).toHaveBeenCalledWith({
      path: '/app/nested/input.txt',
      content: 'input',
    });
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
    });
    expect(await sandbox.readFile('/app/report.txt')).toBe('report');
    expect(session.readTextFile).toHaveBeenCalledWith({
      path: '/app/report.txt',
    });
  });

  it('works with the Vercel Sandbox adapter', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: async () => 'vercel output',
      stderr: async () => '',
    });
    const writeFiles = vi.fn().mockResolvedValue(undefined);
    const nativeSandbox = {
      name: 'test-vercel-sandbox',
      runCommand,
      writeFiles,
      readFileToBuffer: vi.fn().mockResolvedValue(Buffer.from('report')),
    } as unknown as VercelNativeSandboxSession;
    const { bash, sandbox } = await createBashTool({
      sandbox: createVercelSandboxSessionFromNativeSandbox(nativeSandbox),
      workingDirectory: '/vercel/sandbox/workspace',
      files: { 'input.txt': 'input' },
    });
    expect(writeFiles).toHaveBeenCalledWith(
      [
        {
          path: '/vercel/sandbox/workspace/input.txt',
          content: new TextEncoder().encode('input'),
        },
      ],
      undefined,
    );
    expect(await execute(bash, 'cat input.txt')).toEqual({
      stdout: 'vercel output',
      stderr: '',
      exitCode: 0,
    });
    expect(runCommand).toHaveBeenLastCalledWith({
      cmd: 'bash',
      args: ['-c', 'cat input.txt'],
      cwd: '/vercel/sandbox/workspace',
    });
    expect(await sandbox.readFile('/vercel/sandbox/workspace/report.txt')).toBe(
      'report',
    );
  });

  it('shares files across tools using the same session without resetting them', async () => {
    const session = await createSandbox();
    const first = await createBashTool({
      sandbox: session,
      files: { 'input.txt': 'hello' },
    });
    await execute(first.bash, 'cp input.txt report.txt');
    const second = await createBashTool({ sandbox: session });
    expect(await second.sandbox.readFile('/workspace/report.txt')).toBe(
      'hello',
    );
  });

  it.each(['/custom/work/', "/tmp/it's $(echo literal)", '/'])(
    'initializes and executes in a custom working directory: %s',
    async workingDirectory => {
      const { bash } = await createBashTool({
        sandbox: await createSandbox(),
        workingDirectory,
        files: { 'input.txt': 'hello' },
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
      createBashTool({ sandbox, files: { 'input.txt': 'input' } }),
    ).rejects.toThrow('Permission denied');
    expect(write).not.toHaveBeenCalled();
  });

  it('propagates an aborted command', async () => {
    const { bash } = await createBashTool({ sandbox: await createSandbox() });
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
  });

  it('executes pipelines against supplied files and exposes generated files', async () => {
    const { bash, sandbox } = await createBashTool({
      sandbox: await createSandbox(),
      files: { 'data/words.txt': 'pear\napple\npear\n' },
    });

    expect(
      await execute(bash, 'cat data/words.txt | sort | uniq > report.txt'),
    ).toEqual({ stdout: '', stderr: '', exitCode: 0 });
    expect(await sandbox.readFile('/workspace/report.txt')).toBe(
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

    await execute(first.bash, 'echo private > private.txt');

    expect(await execute(second.bash, 'test -e private.txt')).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
  });

  it('resets shell state between calls while preserving files', async () => {
    const { bash } = await createBashTool({ sandbox: await createSandbox() });

    await execute(
      bash,
      'mkdir subdir; cd subdir; export NAME=value; touch saved',
    );

    expect(
      await execute(
        bash,
        'pwd; printf "name=%s\\n" "$NAME"; test -f subdir/saved',
      ),
    ).toEqual({ stdout: '/workspace\nname=\n', stderr: '', exitCode: 0 });
  });

  it('preserves stderr and nonzero exit codes for model recovery', async () => {
    const { bash } = await createBashTool({ sandbox: await createSandbox() });

    expect(
      await execute(bash, 'echo partial; echo failure >&2; exit 7'),
    ).toEqual({ stdout: 'partial\n', stderr: 'failure\n', exitCode: 7 });
  });

  it('applies the configured output limit to both streams', async () => {
    const { bash } = await createBashTool({
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
    const { bash } = await createBashTool({
      sandbox: await createSandbox(),
      files: { 'large.txt': 'x'.repeat(30_001) },
    });

    expect(await execute(bash, 'cat large.txt')).toEqual({
      stdout: `${'x'.repeat(30_000)}\n[Output truncated: 1 characters omitted.]`,
      stderr: '',
      exitCode: 0,
    });
  });

  it('leaves output at the limit unchanged', async () => {
    const { bash } = await createBashTool({
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

  it.each(['/absolute.txt', '../outside.txt', 'nested/../../outside.txt', ''])(
    'rejects initial file paths outside the workspace: %s',
    async path => {
      await expect(
        createBashTool({
          sandbox: await createSandbox(),
          files: { [path]: 'content' },
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
    },
  );

  it('initializes paths containing spaces and shell metacharacters literally', async () => {
    const { sandbox } = await createBashTool({
      sandbox: await createSandbox(),
      files: { 'nested/a $(echo b).txt': 'literal path' },
    });

    expect(await sandbox.readFile('/workspace/nested/a $(echo b).txt')).toBe(
      'literal path',
    );
  });

  it('rejects reads of missing generated files', async () => {
    const { sandbox } = await createBashTool({
      sandbox: await createSandbox(),
    });

    await expect(sandbox.readFile('/workspace/missing.txt')).rejects.toThrow();
  });

  it('executes as a function tool in the standard AI SDK loop', async () => {
    const { bash } = await createBashTool({
      sandbox: await createSandbox(),
      files: { 'message.txt': 'hello from bash' },
    });
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
