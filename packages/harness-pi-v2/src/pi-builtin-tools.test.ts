import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, test } from 'vitest';
import {
  PI_BUILTIN_TOOLS,
  PI_BUILTIN_TOOL_DEFINITIONS,
  createPiBuiltinToolExecutors,
  type PiBuiltinToolInput,
  type PiBuiltinToolName,
} from './pi-builtin-tools';

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const workDir = `${session.defaultWorkingDirectory}/project`;
  await session.writeTextFile({
    path: `${workDir}/notes.txt`,
    content: 'alpha\nbeta\n',
  });
  const executors = createPiBuiltinToolExecutors({
    sandbox: { session, workDir, home: session.defaultWorkingDirectory },
  });
  const run = <NAME extends PiBuiltinToolName>({
    toolName,
    input,
  }: {
    toolName: NAME;
    input: PiBuiltinToolInput<NAME>;
  }) =>
    executors[toolName].execute('call-1', input, new AbortController().signal);
  return { session, workDir, run };
}

function text(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content.map(part => part.text).join('');
}

describe('PI_BUILTIN_TOOLS', () => {
  test('declares Pi built-in tools with their replay policies', () => {
    expect(PI_BUILTIN_TOOLS.read.replay).toBe('safe');
    expect(PI_BUILTIN_TOOLS.write.replay).toBe('never');
    expect(PI_BUILTIN_TOOLS.edit.replay).toBe('never');
    expect(PI_BUILTIN_TOOLS.bash.replay).toBe('never');
    expect(PI_BUILTIN_TOOLS.grep.replay).toBe('safe');
    expect(PI_BUILTIN_TOOLS.find.replay).toBe('safe');
    expect(PI_BUILTIN_TOOLS.ls.replay).toBe('safe');
    expect(PI_BUILTIN_TOOLS.read.description).toBe(
      PI_BUILTIN_TOOL_DEFINITIONS.read.description,
    );
  });
});

describe('createPiBuiltinToolExecutors', () => {
  test('reads a file', async () => {
    const { run } = await setup();

    expect(
      text(await run({ toolName: 'read', input: { path: 'notes.txt' } })),
    ).toContain('alpha');
  });

  test('writes and edits a file', async () => {
    const { session, workDir, run } = await setup();

    await run({
      toolName: 'write',
      input: { path: 'dir/new.txt', content: 'one two' },
    });
    await run({
      toolName: 'edit',
      input: {
        path: 'dir/new.txt',
        edits: [{ oldText: 'two', newText: 'three' }],
      },
    });

    expect(await session.readTextFile({ path: `${workDir}/dir/new.txt` })).toBe(
      'one three',
    );
  });

  test('finds and lists files', async () => {
    const { run } = await setup();
    await run({
      toolName: 'write',
      input: { path: 'src/main.ts', content: '' },
    });

    expect(
      text(await run({ toolName: 'find', input: { pattern: '*.ts' } })),
    ).toBe('src/main.ts');
    expect(text(await run({ toolName: 'ls', input: {} }))).toBe(
      'notes.txt\nsrc/',
    );
  });

  test('resolves a leading tilde against the sandbox home directory', async () => {
    const { session, run } = await setup();
    await session.writeTextFile({
      path: `${session.defaultWorkingDirectory}/home.txt`,
      content: 'at home',
    });

    expect(
      text(await run({ toolName: 'read', input: { path: '~/home.txt' } })),
    ).toContain('at home');
  });

  test('runs grep and bash in the sandbox', async () => {
    const { run } = await setup();

    expect(
      text(await run({ toolName: 'grep', input: { pattern: 'beta' } })),
    ).toBe('notes.txt:2: beta');
    expect(
      text(await run({ toolName: 'bash', input: { command: 'pwd' } })),
    ).toContain('/project');
  });
});
