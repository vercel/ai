import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import {
  generateText,
  InvalidArgumentError,
  isStepCount,
  type Experimental_SandboxSession as SandboxSession,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFsTools } from './create-fs-tools';

type FsTools = ReturnType<typeof createFsTools>;

type ToolName = keyof FsTools;

type InputOf<NAME extends ToolName> = Parameters<FsTools[NAME]['execute']>[0];

type OutputOf<NAME extends ToolName> = Exclude<
  Awaited<ReturnType<FsTools[NAME]['execute']>>,
  AsyncIterable<unknown>
>;

const sessions: Awaited<
  ReturnType<typeof createJustBashNetworkSandboxSession>
>[] = [];

async function createSandbox() {
  const session = await createJustBashNetworkSandboxSession({ cwd: '/work' });
  sessions.push(session);
  return session.restricted();
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.destroy()));
});

function execute<NAME extends ToolName>(
  tools: FsTools,
  name: NAME,
  input: InputOf<NAME>,
  options: { sandbox?: SandboxSession; abortSignal?: AbortSignal },
): Promise<OutputOf<NAME>> {
  const tool = tools[name] as unknown as {
    execute: (input: unknown, options: unknown) => Promise<OutputOf<NAME>>;
  };
  return tool.execute(input, {
    toolCallId: 'test-call',
    messages: [],
    context: {},
    experimental_sandbox: options.sandbox,
    abortSignal: options.abortSignal,
  });
}

async function toModelOutput<NAME extends ToolName>(
  tools: FsTools,
  name: NAME,
  output: OutputOf<NAME>,
) {
  return tools[name].toModelOutput!({
    toolCallId: 'test-call',
    input: {} as never,
    output: output as never,
  });
}

describe('createFsTools', () => {
  describe('options', () => {
    it.each(['maxFileSize', 'maxReadLength', 'maxResults', 'timeout'])(
      'rejects an invalid %s',
      option => {
        expect(() => createFsTools({ [option]: 0 })).toThrow(
          InvalidArgumentError,
        );
        expect(() => createFsTools({ [option]: 1.5 })).toThrow(
          InvalidArgumentError,
        );
      },
    );

    it('rejects an empty workingDirectory', () => {
      expect(() => createFsTools({ workingDirectory: ' ' })).toThrow(
        InvalidArgumentError,
      );
    });
  });

  it('throws when no sandbox is available', async () => {
    const tools = createFsTools();
    await expect(execute(tools, 'read', { path: 'a.txt' }, {})).rejects.toThrow(
      'The filesystem tools require a sandbox',
    );
  });

  it('uses experimental_sandbox from generateText', async () => {
    const sandbox = await createSandbox();
    await sandbox.writeTextFile({ path: 'notes.txt', content: 'hello\n' });
    const { read } = createFsTools();

    let step = 0;
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          step++;
          return step === 1
            ? {
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'read',
                    input: JSON.stringify({ path: 'notes.txt' }),
                  },
                ],
                finishReason: { unified: 'tool-calls', raw: undefined },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
                warnings: [],
              }
            : {
                content: [{ type: 'text', text: 'done' }],
                finishReason: { unified: 'stop', raw: undefined },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
                warnings: [],
              };
        },
      }),
      tools: { read },
      experimental_sandbox: sandbox,
      stopWhen: isStepCount(2),
      prompt: 'Read notes.txt',
    });

    expect(result.steps[0].toolResults[0].output).toMatchObject({
      type: 'text',
      content: 'hello',
    });
  });

  describe('read', () => {
    it('reads a text file with line numbers in the model output', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({
        path: 'notes.txt',
        content: 'line 1\nline 2\nline 3\n',
      });
      const tools = createFsTools();

      const output = await execute(
        tools,
        'read',
        { path: 'notes.txt' },
        { sandbox },
      );

      expect(output).toEqual({
        type: 'text',
        path: 'notes.txt',
        content: 'line 1\nline 2\nline 3',
        startLine: 1,
        endLine: 3,
        totalLines: 3,
      });
      expect(await toModelOutput(tools, 'read', output)).toEqual({
        type: 'text',
        value: '1\tline 1\n2\tline 2\n3\tline 3',
      });
    });

    it('reads a range of lines and reports the next offset', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({
        path: 'notes.txt',
        content: 'a\r\nb\r\nc\r\nd\r\n',
      });
      const tools = createFsTools();

      const output = await execute(
        tools,
        'read',
        { path: 'notes.txt', offset: 2, limit: 2 },
        { sandbox },
      );

      expect(output).toMatchObject({
        content: 'b\nc',
        startLine: 2,
        endLine: 3,
        totalLines: 4,
        nextOffset: 4,
      });
      expect(await toModelOutput(tools, 'read', output)).toEqual({
        type: 'text',
        value:
          '2\tb\n3\tc\n\n[Showing lines 2-3 of 4. Call read with offset 4 to continue.]',
      });
    });

    it('stops at maxReadLength', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({
        path: 'long.txt',
        content: 'aaaa\nbbbb\ncccc\n',
      });
      const tools = createFsTools({ maxReadLength: 8 });

      expect(
        await execute(tools, 'read', { path: 'long.txt' }, { sandbox }),
      ).toMatchObject({ content: 'aaaa', endLine: 1, nextOffset: 2 });
    });

    it('truncates long lines', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({
        path: 'wide.txt',
        content: 'x'.repeat(3000),
      });
      const tools = createFsTools();

      const output = await execute(
        tools,
        'read',
        { path: 'wide.txt' },
        { sandbox },
      );

      expect(output).toMatchObject({
        content: `${'x'.repeat(2000)}… [line truncated]`,
      });
    });

    it('returns images as files', async () => {
      const sandbox = await createSandbox();
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
      ]);
      await sandbox.writeBinaryFile({ path: 'image.png', content: png });
      const tools = createFsTools();

      const output = await execute(
        tools,
        'read',
        { path: 'image.png' },
        { sandbox },
      );

      expect(output).toEqual({
        type: 'file',
        path: 'image.png',
        mediaType: 'image/png',
        size: 12,
        data: Buffer.from(png).toString('base64'),
      });
      expect(await toModelOutput(tools, 'read', output)).toEqual({
        type: 'content',
        value: [
          { type: 'text', text: 'image.png (image/png, 12 bytes)' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: Buffer.from(png).toString('base64') },
            filename: 'image.png',
          },
        ],
      });
    });

    it('describes other binary files', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeBinaryFile({
        path: 'data.bin',
        content: new Uint8Array([1, 0, 2, 3]),
      });
      const tools = createFsTools();

      expect(
        await execute(tools, 'read', { path: 'data.bin' }, { sandbox }),
      ).toEqual({ type: 'binary', path: 'data.bin', size: 4 });
    });

    it('describes empty files', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'empty.txt', content: '' });
      const tools = createFsTools();

      const output = await execute(
        tools,
        'read',
        { path: 'empty.txt' },
        { sandbox },
      );

      expect(output).toMatchObject({ type: 'text', totalLines: 0 });
      expect(await toModelOutput(tools, 'read', output)).toEqual({
        type: 'text',
        value: '[The file is empty.]',
      });
    });

    it.each([
      ['missing.txt', 'not_found'],
      ['dir', 'is_directory'],
    ])('returns an error for %s', async (path, errorCode) => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'dir/a.txt', content: '' });
      const tools = createFsTools();

      const output = await execute(tools, 'read', { path }, { sandbox });

      expect(output).toMatchObject({ type: 'error', errorCode });
      expect(await toModelOutput(tools, 'read', output)).toMatchObject({
        type: 'error-text',
      });
    });

    it('returns an error for files larger than maxFileSize', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'big.txt', content: '12345' });
      const tools = createFsTools({ maxFileSize: 4 });

      expect(
        await execute(tools, 'read', { path: 'big.txt' }, { sandbox }),
      ).toMatchObject({ type: 'error', errorCode: 'file_too_large' });
    });

    it('returns an error for an offset past the end', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'a.txt', content: 'one\n' });
      const tools = createFsTools();

      expect(
        await execute(tools, 'read', { path: 'a.txt', offset: 5 }, { sandbox }),
      ).toMatchObject({ type: 'error', errorCode: 'invalid_offset' });
    });

    it('resolves relative paths against workingDirectory', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({
        path: '/work/project/a.txt',
        content: 'a',
      });
      const tools = createFsTools({ workingDirectory: 'project' });

      expect(
        await execute(tools, 'read', { path: 'a.txt' }, { sandbox }),
      ).toMatchObject({ type: 'text', content: 'a' });
      expect(
        await execute(
          tools,
          'read',
          { path: '/work/project/a.txt' },
          { sandbox },
        ),
      ).toMatchObject({ type: 'text', content: 'a' });
    });
  });

  describe('write', () => {
    it('writes a file and creates parent directories', async () => {
      const sandbox = await createSandbox();
      const tools = createFsTools();

      const output = await execute(
        tools,
        'write',
        { path: 'a/b/c.txt', content: 'héllo' },
        { sandbox },
      );

      expect(output).toEqual({ type: 'written', path: 'a/b/c.txt', size: 6 });
      expect(await sandbox.readTextFile({ path: '/work/a/b/c.txt' })).toBe(
        'héllo',
      );
      expect(await toModelOutput(tools, 'write', output)).toEqual({
        type: 'text',
        value: 'Wrote 6 bytes to a/b/c.txt.',
      });
    });

    it('returns an error for a directory', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'dir/a.txt', content: '' });
      const tools = createFsTools();

      expect(
        await execute(
          tools,
          'write',
          { path: 'dir', content: 'x' },
          { sandbox },
        ),
      ).toMatchObject({ type: 'error', errorCode: 'is_directory' });
    });
  });

  describe('edit', () => {
    async function edit(
      content: string,
      input: Omit<InputOf<'edit'>, 'path'>,
    ): Promise<{ output: OutputOf<'edit'>; content: string | null }> {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'file.txt', content });
      const output = await execute(
        createFsTools(),
        'edit',
        { path: 'file.txt', ...input },
        { sandbox },
      );
      return {
        output,
        content: await sandbox.readTextFile({ path: 'file.txt' }),
      };
    }

    it('replaces a unique match', async () => {
      const result = await edit('one\ntwo\nthree\n', {
        oldString: 'two',
        newString: 'TWO\n2',
      });

      expect(result).toEqual({
        output: {
          type: 'edited',
          path: 'file.txt',
          replacements: 1,
          startLine: 2,
          endLine: 3,
          matchMode: 'exact',
        },
        content: 'one\nTWO\n2\nthree\n',
      });
    });

    it('rejects multiple matches without replaceAll', async () => {
      const result = await edit('a\nx\nb\nx\n', {
        oldString: 'x',
        newString: 'y',
      });

      expect(result.output).toMatchObject({
        type: 'error',
        errorCode: 'multiple_matches',
        message: expect.stringContaining('at lines 2, 4'),
      });
      expect(result.content).toBe('a\nx\nb\nx\n');
    });

    it('replaces every match with replaceAll', async () => {
      const result = await edit('a\nx\nb\nx\n', {
        oldString: 'x',
        newString: 'yy',
        replaceAll: true,
      });

      expect(result).toEqual({
        output: expect.objectContaining({
          replacements: 2,
          startLine: 2,
          endLine: 4,
        }),
        content: 'a\nyy\nb\nyy\n',
      });
    });

    it('keeps CRLF line endings and the byte order mark', async () => {
      const result = await edit('﻿one\r\ntwo\r\nthree\r\n', {
        oldString: 'one\ntwo',
        newString: 'ONE\nTWO',
      });

      expect(result.output).toMatchObject({ type: 'edited' });
      expect(result.content).toBe('﻿ONE\r\nTWO\r\nthree\r\n');
    });

    it('matches after ignoring whitespace at line ends', async () => {
      const result = await edit('function a() {  \n  return 1;\n}\n', {
        oldString: 'function a() {\n  return 1;',
        newString: 'function a() {\n  return 2;',
      });

      expect(result).toEqual({
        output: expect.objectContaining({ matchMode: 'trailing-whitespace' }),
        content: 'function a() {\n  return 2;\n}\n',
      });
    });

    it.each([
      ['no_match', 'missing', 'x'],
      ['no_changes', 'one', 'one'],
    ])('returns %s', async (errorCode, oldString, newString) => {
      const result = await edit('one\n', { oldString, newString });

      expect(result).toEqual({
        output: expect.objectContaining({ type: 'error', errorCode }),
        content: 'one\n',
      });
    });

    it('returns an error for a missing file', async () => {
      const sandbox = await createSandbox();

      expect(
        await execute(
          createFsTools(),
          'edit',
          { path: 'missing.txt', oldString: 'a', newString: 'b' },
          { sandbox },
        ),
      ).toMatchObject({ type: 'error', errorCode: 'not_found' });
    });

    it('returns an error for binary files', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeBinaryFile({
        path: 'data.bin',
        content: new Uint8Array([0xff, 0xfe, 0x00]),
      });

      expect(
        await execute(
          createFsTools(),
          'edit',
          { path: 'data.bin', oldString: 'a', newString: 'b' },
          { sandbox },
        ),
      ).toMatchObject({ type: 'error', errorCode: 'binary_file' });
    });
  });

  describe('deleteFile', () => {
    it('deletes a file', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'a.txt', content: 'a' });
      const tools = createFsTools();

      const output = await execute(
        tools,
        'deleteFile',
        { path: 'a.txt' },
        { sandbox },
      );

      expect(output).toEqual({ type: 'deleted', path: 'a.txt' });
      expect(await sandbox.stat({ path: 'a.txt' })).toBeNull();
    });

    it.each([
      ['missing.txt', 'not_found'],
      ['dir', 'is_directory'],
    ])('returns an error for %s', async (path, errorCode) => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'dir/a.txt', content: '' });

      expect(
        await execute(createFsTools(), 'deleteFile', { path }, { sandbox }),
      ).toMatchObject({ type: 'error', errorCode });
      expect(await sandbox.stat({ path: 'dir/a.txt' })).not.toBeNull();
    });
  });

  describe('list', () => {
    it('lists a directory sorted by name', async () => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'b.txt', content: '' });
      await sandbox.writeTextFile({ path: 'a/nested.txt', content: '' });
      await sandbox.writeTextFile({ path: '.env', content: '' });
      const tools = createFsTools();

      const output = await execute(tools, 'list', {}, { sandbox });

      expect(output).toEqual({
        type: 'entries',
        path: '.',
        entries: [
          { name: '.env', type: 'file' },
          { name: 'a', type: 'directory' },
          { name: 'b.txt', type: 'file' },
        ],
        totalEntries: 3,
      });
      expect(await toModelOutput(tools, 'list', output)).toEqual({
        type: 'text',
        value: '.env\na/\nb.txt',
      });
    });

    it.each([
      ['missing', 'not_found'],
      ['b.txt', 'not_a_directory'],
    ])('returns an error for %s', async (path, errorCode) => {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({ path: 'b.txt', content: '' });

      expect(
        await execute(createFsTools(), 'list', { path }, { sandbox }),
      ).toMatchObject({ type: 'error', errorCode });
    });
  });

  describe('glob', () => {
    async function createProject() {
      const sandbox = await createSandbox();
      for (const path of [
        'src/index.ts',
        'src/lib/util.ts',
        'src/lib/util.test.ts',
        'src/styles.css',
        'README.md',
        '.config/settings.ts',
      ]) {
        await sandbox.writeTextFile({ path, content: '' });
      }
      return sandbox;
    }

    it('matches file names at any depth for patterns without a slash', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools(),
          'glob',
          { pattern: '*.ts' },
          { sandbox },
        ),
      ).toEqual({
        type: 'files',
        path: '.',
        pattern: '*.ts',
        files: [
          '.config/settings.ts',
          'src/index.ts',
          'src/lib/util.test.ts',
          'src/lib/util.ts',
        ],
        totalFiles: 4,
      });
    });

    it('matches relative paths in a directory', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools(),
          'glob',
          { pattern: 'lib/*.ts', path: 'src' },
          { sandbox },
        ),
      ).toMatchObject({
        files: ['src/lib/util.test.ts', 'src/lib/util.ts'],
      });
    });

    it('limits results to maxResults', async () => {
      const sandbox = await createProject();
      const tools = createFsTools({ maxResults: 2 });

      const output = await execute(
        tools,
        'glob',
        { pattern: '**/*' },
        { sandbox },
      );

      expect(output).toMatchObject({ totalFiles: 6 });
      expect(await toModelOutput(tools, 'glob', output)).toEqual({
        type: 'text',
        value:
          '.config/settings.ts\nREADME.md\n\n[Showing 2 of 6 files. Use a more specific pattern or path.]',
      });
    });

    it('returns an error for a missing path', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools(),
          'glob',
          { pattern: '*', path: 'missing' },
          { sandbox },
        ),
      ).toMatchObject({ type: 'error', errorCode: 'not_found' });
    });

    it('searches in workingDirectory', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools({ workingDirectory: 'src' }),
          'glob',
          { pattern: '*.css' },
          { sandbox },
        ),
      ).toMatchObject({ files: ['styles.css'] });
    });
  });

  describe('grep', () => {
    async function createProject() {
      const sandbox = await createSandbox();
      await sandbox.writeTextFile({
        path: 'src/a.ts',
        content: 'const foo = 1;\nconst bar = 2;\nfoo();\n',
      });
      await sandbox.writeTextFile({ path: 'src/b.js', content: 'FOO\n' });
      await sandbox.writeTextFile({ path: '-dash.txt', content: 'foo\n' });
      return sandbox;
    }

    it('returns matching lines', async () => {
      const sandbox = await createProject();
      const tools = createFsTools();

      const output = await execute(
        tools,
        'grep',
        { pattern: 'fo+', path: 'src' },
        { sandbox },
      );

      expect(output).toEqual({
        type: 'matches',
        path: 'src',
        pattern: 'fo+',
        outputMode: 'content',
        lines: ['src/a.ts:1:const foo = 1;', 'src/a.ts:3:foo();'],
        totalLines: 2,
      });
      expect(await toModelOutput(tools, 'grep', output)).toEqual({
        type: 'text',
        value: 'src/a.ts:1:const foo = 1;\nsrc/a.ts:3:foo();',
      });
    });

    it('supports ignoreCase, literal, and glob', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools(),
          'grep',
          { pattern: 'foo', ignoreCase: true, glob: '*.js', literal: true },
          { sandbox },
        ),
      ).toMatchObject({ lines: ['src/b.js:1:FOO'] });
    });

    it('returns file names and counts', async () => {
      const sandbox = await createProject();
      const tools = createFsTools();

      expect(
        await execute(
          tools,
          'grep',
          { pattern: 'foo', path: 'src', outputMode: 'files' },
          { sandbox },
        ),
      ).toMatchObject({ lines: ['src/a.ts'] });
      expect(
        await execute(
          tools,
          'grep',
          { pattern: 'foo', path: 'src', outputMode: 'count' },
          { sandbox },
        ),
      ).toMatchObject({ lines: ['src/a.ts:2'] });
    });

    it('returns context lines', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools(),
          'grep',
          { pattern: 'bar', path: 'src/a.ts', context: 1 },
          { sandbox },
        ),
      ).toMatchObject({
        lines: [
          'src/a.ts-1-const foo = 1;',
          'src/a.ts:2:const bar = 2;',
          'src/a.ts-3-foo();',
        ],
      });
    });

    it('handles paths that start with a dash', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools(),
          'grep',
          { pattern: 'foo', path: '-dash.txt' },
          { sandbox },
        ),
      ).toMatchObject({ type: 'matches', lines: ['-dash.txt:1:foo'] });
    });

    it('limits output lines', async () => {
      const sandbox = await createProject();

      expect(
        await execute(
          createFsTools(),
          'grep',
          { pattern: 'foo', path: 'src', limit: 1 },
          { sandbox },
        ),
      ).toMatchObject({ lines: ['src/a.ts:1:const foo = 1;'], totalLines: 2 });
    });

    it('returns no matches', async () => {
      const sandbox = await createProject();
      const tools = createFsTools();

      const output = await execute(
        tools,
        'grep',
        { pattern: 'missing' },
        { sandbox },
      );

      expect(output).toMatchObject({ lines: [], totalLines: 0 });
      expect(await toModelOutput(tools, 'grep', output)).toEqual({
        type: 'text',
        value: 'No matches for missing in ..',
      });
    });

    it.each([
      [{ pattern: 'foo', path: 'missing' }, 'not_found'],
      [{ pattern: '(' }, 'invalid_pattern'],
    ])('returns an error for %j', async (input, errorCode) => {
      const sandbox = await createProject();

      expect(
        await execute(createFsTools(), 'grep', input, { sandbox }),
      ).toMatchObject({ type: 'error', errorCode });
    });

    it('quotes patterns', async () => {
      const sandbox = await createProject();
      await sandbox.writeTextFile({
        path: 'quotes.txt',
        content: `it's "$(whoami)"\n`,
      });

      expect(
        await execute(
          createFsTools(),
          'grep',
          { pattern: `it's "$(whoami)"`, literal: true, path: 'quotes.txt' },
          { sandbox },
        ),
      ).toMatchObject({ lines: [`quotes.txt:1:it's "$(whoami)"`] });
    });
  });

  describe('timeout', () => {
    it('returns a timeout error when the sandbox does not respond', async () => {
      const sandbox = await createSandbox();
      vi.spyOn(sandbox, 'stat').mockImplementation(() => new Promise(() => {}));

      expect(
        await execute(
          createFsTools({ timeout: 10 }),
          'read',
          { path: 'a.txt' },
          { sandbox },
        ),
      ).toEqual({
        type: 'error',
        path: 'a.txt',
        errorCode: 'timeout',
        message: 'The operation timed out after 10 ms.',
      });
    });

    it('rethrows caller aborts', async () => {
      const sandbox = await createSandbox();
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));

      await expect(
        execute(
          createFsTools(),
          'read',
          { path: 'a.txt' },
          { sandbox, abortSignal: controller.signal },
        ),
      ).rejects.toThrow('cancelled');
    });
  });
});
