import { generateText, InvalidArgumentError, isStepCount } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
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

describe('createBashTool', () => {
  it('executes pipelines against supplied files and exposes generated files', async () => {
    const { bash, sandbox } = await createBashTool({
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

  it('creates independent filesystems for separate workflows', async () => {
    const first = await createBashTool();
    const second = await createBashTool();

    await execute(first.bash, 'echo private > private.txt');

    expect(await execute(second.bash, 'test -e private.txt')).toEqual({
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
  });

  it('resets shell state between calls while preserving files', async () => {
    const { bash } = await createBashTool();

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
    const { bash } = await createBashTool();

    expect(
      await execute(bash, 'echo partial; echo failure >&2; exit 7'),
    ).toEqual({ stdout: 'partial\n', stderr: 'failure\n', exitCode: 7 });
  });

  it('applies the configured output limit to both streams', async () => {
    const { bash } = await createBashTool({ maxOutputLength: 4 });

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
      files: { 'large.txt': 'x'.repeat(30_001) },
    });

    expect(await execute(bash, 'cat large.txt')).toEqual({
      stdout: `${'x'.repeat(30_000)}\n[Output truncated: 1 characters omitted.]`,
      stderr: '',
      exitCode: 0,
    });
  });

  it('leaves output at the limit unchanged', async () => {
    const { bash } = await createBashTool({ maxOutputLength: 4 });

    expect(await execute(bash, 'printf 1234')).toEqual({
      stdout: '1234',
      stderr: '',
      exitCode: 0,
    });
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects an invalid output limit: %s',
    async maxOutputLength => {
      await expect(createBashTool({ maxOutputLength })).rejects.toBeInstanceOf(
        InvalidArgumentError,
      );
    },
  );

  it.each(['/absolute.txt', '../outside.txt', 'nested/../../outside.txt', ''])(
    'rejects initial file paths outside the workspace: %s',
    async path => {
      await expect(
        createBashTool({ files: { [path]: 'content' } }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
    },
  );

  it('initializes paths containing spaces and shell metacharacters literally', async () => {
    const { sandbox } = await createBashTool({
      files: { 'nested/a $(echo b).txt': 'literal path' },
    });

    expect(await sandbox.readFile('/workspace/nested/a $(echo b).txt')).toBe(
      'literal path',
    );
  });

  it('rejects reads of missing generated files', async () => {
    const { sandbox } = await createBashTool();

    await expect(sandbox.readFile('/workspace/missing.txt')).rejects.toThrow();
  });

  it('executes as a function tool in the standard AI SDK loop', async () => {
    const { bash } = await createBashTool({
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
