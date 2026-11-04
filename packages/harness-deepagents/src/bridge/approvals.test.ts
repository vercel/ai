import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildInterruptOn,
  builtinToolRequiresApproval,
  collectActionRequests,
  isBuiltinToolIncluded,
} from './approvals';

describe('builtinToolRequiresApproval', () => {
  it('never requires approval under allow-all', () => {
    expect(builtinToolRequiresApproval('readonly', 'allow-all')).toBe(false);
    expect(builtinToolRequiresApproval('edit', 'allow-all')).toBe(false);
    expect(builtinToolRequiresApproval('bash', 'allow-all')).toBe(false);
  });

  it('only gates bash under allow-edits', () => {
    expect(builtinToolRequiresApproval('readonly', 'allow-edits')).toBe(false);
    expect(builtinToolRequiresApproval('edit', 'allow-edits')).toBe(false);
    expect(builtinToolRequiresApproval('bash', 'allow-edits')).toBe(true);
  });

  it('gates edit and bash under allow-reads', () => {
    expect(builtinToolRequiresApproval('readonly', 'allow-reads')).toBe(false);
    expect(builtinToolRequiresApproval('edit', 'allow-reads')).toBe(true);
    expect(builtinToolRequiresApproval('bash', 'allow-reads')).toBe(true);
  });
});

describe('buildInterruptOn', () => {
  const options = {
    workDir: '/workspace',
    readableSkillRoots: [],
    builtinToolFiltering: undefined,
  };
  const conditional = {
    allowedDecisions: ['approve', 'reject'],
    when: expect.any(Function),
  };
  const unconditional = { allowedDecisions: ['approve', 'reject'] };
  it('does not gate unrestricted sessions', () => {
    expect(
      buildInterruptOn({ ...options, permissionMode: undefined }),
    ).toBeUndefined();
    expect(
      buildInterruptOn({ ...options, permissionMode: 'allow-all' }),
    ).toBeUndefined();
  });
  it('checks file targets and gates shell execution under allow-edits', () => {
    expect(
      buildInterruptOn({ ...options, permissionMode: 'allow-edits' }),
    ).toEqual({
      read_file: conditional,
      write_file: conditional,
      edit_file: conditional,
      delete: conditional,
      ls: conditional,
      grep: conditional,
      glob: conditional,
      execute: unconditional,
    });
  });
  it('checks reads and gates mutations under allow-reads', () => {
    expect(
      buildInterruptOn({ ...options, permissionMode: 'allow-reads' }),
    ).toEqual({
      read_file: conditional,
      ls: conditional,
      grep: conditional,
      glob: conditional,
      write_file: unconditional,
      edit_file: unconditional,
      delete: unconditional,
      execute: unconditional,
      task: unconditional,
      write_todos: unconditional,
    });
  });
  it('does not approve inactive built-ins through permission gating', () => {
    expect(
      buildInterruptOn({
        ...options,
        permissionMode: 'allow-reads',
        builtinToolFiltering: { mode: 'deny', toolNames: ['write'] },
      }),
    ).not.toHaveProperty('write_file');
    expect(
      buildInterruptOn({
        ...options,
        permissionMode: undefined,
        builtinToolFiltering: { mode: 'deny', toolNames: ['read'] },
      }),
    ).toBeUndefined();
  });
});

describe('file approval predicates', () => {
  let directory: string;
  let workDir: string;
  let skill: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'deepagents-approvals-'));
    workDir = path.join(directory, 'workspace');
    skill = path.join(directory, 'skill');
    await mkdir(workDir);
    await mkdir(skill);
    await mkdir(path.join(workDir, 'nested'));
    await mkdir(path.join(directory, 'other'));
    await writeFile(path.join(directory, 'other', 'file.txt'), 'fixture');
    await symlink(skill, path.join(workDir, 'external'));
    await symlink(
      path.join(directory, 'other'),
      path.join(workDir, 'untrusted'),
    );
    await symlink(
      path.join(directory, 'other'),
      path.join(workDir, 'nested', 'untrusted'),
    );
    await symlink(path.join(workDir, 'nested'), path.join(workDir, 'internal'));
    await symlink(
      path.join(directory, 'other', 'file.txt'),
      path.join(workDir, 'external-file.txt'),
    );
    await symlink(
      path.join(directory, 'missing'),
      path.join(workDir, 'broken'),
    );
    await symlink('loop', path.join(workDir, 'loop'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    { name: 'read_file', args: { file_path: 'file.txt' }, interrupts: false },
    {
      name: 'write_file',
      args: { file_path: 'new/file.txt' },
      interrupts: false,
    },
    { name: 'edit_file', args: { path: 'file.txt' }, interrupts: false },
    { name: 'delete', args: { file_path: 'file.txt' }, interrupts: false },
    {
      name: 'delete',
      args: { file_path: '../other/file.txt' },
      interrupts: true,
    },
    {
      name: 'delete',
      args: { file_path: '../skill/file.txt' },
      interrupts: true,
    },
    {
      name: 'delete',
      args: { file_path: 'external/file.txt' },
      interrupts: true,
    },
    { name: 'delete', args: {}, interrupts: true },
    {
      name: 'read_file',
      args: { file_path: '../skill/file.txt' },
      interrupts: false,
    },
    {
      name: 'write_file',
      args: { file_path: '../skill/file.txt' },
      interrupts: true,
    },
    {
      name: 'read_file',
      args: { file_path: '../unknown/file.txt' },
      interrupts: true,
    },
    {
      name: 'read_file',
      args: { file_path: null, path: 'file.txt' },
      interrupts: true,
    },
    {
      name: 'write_file',
      args: { file_path: 'external/file.txt' },
      interrupts: true,
    },
    { name: 'read_file', args: {}, interrupts: true },
    { name: 'ls', args: {}, interrupts: true },
    { name: 'grep', args: { pattern: 'text' }, interrupts: true },
    { name: 'grep', args: { pattern: 'text', path: '.' }, interrupts: false },
    { name: 'glob', args: { pattern: '**/*.ts' }, interrupts: false },
    { name: 'glob', args: { pattern: '*.ts', path: '/' }, interrupts: false },
    { name: 'glob', args: { pattern: '../*.ts' }, interrupts: true },
    { name: 'glob', args: { pattern: '\\.\\./*.ts' }, interrupts: true },
    {
      name: 'glob',
      args: { pattern: '*.ts', path: '../unknown' },
      interrupts: true,
    },
  ])(
    '$name $args requires approval=$interrupts',
    async ({ name, args, interrupts }) => {
      const config = buildInterruptOn({
        permissionMode: 'allow-edits',
        builtinToolFiltering: undefined,
        workDir,
        readableSkillRoots: [skill],
      })!;
      const when = config[name].when!;
      await expect(
        when({ toolCall: { name, args } } as Parameters<typeof when>[0]),
      ).resolves.toBe(interrupts);
    },
  );

  it('checks native absolute deletion targets', async () => {
    const config = buildInterruptOn({
      permissionMode: 'allow-edits',
      builtinToolFiltering: undefined,
      workDir,
      readableSkillRoots: [skill],
    })!;
    const when = config.delete.when!;
    for (const [filePath, interrupts] of [
      [path.join(workDir, 'file.txt'), false],
      [path.join(directory, 'other', 'file.txt'), true],
      [path.join(skill, 'file.txt'), true],
    ] as const) {
      await expect(
        when({
          toolCall: { name: 'delete', args: { file_path: filePath } },
        } as unknown as Parameters<typeof when>[0]),
      ).resolves.toBe(interrupts);
    }
  });

  describe.each(['allow-reads', 'allow-edits'] as const)(
    'glob prefixes under %s',
    permissionMode => {
      it.each([
        { pattern: 'untrusted/*.txt', interrupts: true },
        { pattern: 'untrusted/**/*.txt', interrupts: true },
        { pattern: 'nested/untrusted/*.txt', interrupts: true },
        { pattern: 'untrusted/file.txt', interrupts: true },
        { pattern: 'external-file.txt', interrupts: true },
        { pattern: './untrusted//*.txt', interrupts: true },
        { pattern: 'nested/*.txt', interrupts: false },
        { pattern: 'nested/**/*.txt', interrupts: false },
        { pattern: 'nested/file.txt', interrupts: false },
        { pattern: 'internal/*.txt', interrupts: false },
        { pattern: 'external/*.txt', interrupts: false },
        { pattern: '**/*.txt', interrupts: false },
        { pattern: '*/file.txt', interrupts: false },
        { pattern: 'nested?/file.txt', interrupts: false },
        { pattern: 'broken/*.txt', interrupts: true },
        { pattern: 'loop/*.txt', interrupts: true },
        { pattern: '../*.txt', interrupts: true },
        { pattern: '{nested,untrusted}/*.txt', interrupts: true },
        { pattern: '[nu]*/*.txt', interrupts: true },
        { pattern: '@(nested|untrusted)/*.txt', interrupts: true },
        { pattern: 'nested\\*.txt', interrupts: true },
        { pattern: '/nested/*.txt', interrupts: true },
        { pattern: 'untrusted/*.txt', path: '/', interrupts: true },
        { pattern: 'untrusted/*.txt', path: 'nested', interrupts: true },
        { pattern: '*.txt', path: 'untrusted', interrupts: true },
        { pattern: 'nested/*.txt', path: '.', interrupts: false },
        { pattern: '*.txt', path: 'nested', interrupts: false },
      ])(
        '$pattern with path=$path requires approval=$interrupts',
        async ({ pattern, path: searchPath, interrupts }) => {
          const config = buildInterruptOn({
            permissionMode,
            builtinToolFiltering: undefined,
            workDir,
            readableSkillRoots: [skill],
          })!;
          const when = config.glob.when!;
          await expect(
            when({
              toolCall: { name: 'glob', args: { pattern, path: searchPath } },
            } as unknown as Parameters<typeof when>[0]),
          ).resolves.toBe(interrupts);
        },
      );
    },
  );
});

describe('isBuiltinToolIncluded', () => {
  it('includes every built-in when no filtering policy is configured', () => {
    expect(
      isBuiltinToolIncluded({
        nativeName: 'read_file',
        toolFiltering: undefined,
      }),
    ).toBe(true);
  });

  it('maps native names to common names for allow policies', () => {
    expect(
      isBuiltinToolIncluded({
        nativeName: 'read_file',
        toolFiltering: { mode: 'allow', toolNames: ['read'] },
      }),
    ).toBe(true);
    expect(
      isBuiltinToolIncluded({
        nativeName: 'glob',
        toolFiltering: { mode: 'allow', toolNames: ['read'] },
      }),
    ).toBe(false);
  });

  it('maps native names to common names for deny policies', () => {
    expect(
      isBuiltinToolIncluded({
        nativeName: 'execute',
        toolFiltering: { mode: 'deny', toolNames: ['bash'] },
      }),
    ).toBe(false);
    expect(
      isBuiltinToolIncluded({
        nativeName: 'grep',
        toolFiltering: { mode: 'deny', toolNames: ['bash'] },
      }),
    ).toBe(true);
  });

  it('applies policies to native-only built-in names', () => {
    expect(
      isBuiltinToolIncluded({
        nativeName: 'write_todos',
        toolFiltering: { mode: 'allow', toolNames: ['write_todos'] },
      }),
    ).toBe(true);
    expect(
      isBuiltinToolIncluded({
        nativeName: 'task',
        toolFiltering: { mode: 'deny', toolNames: ['task'] },
      }),
    ).toBe(false);
  });
});

describe('collectActionRequests', () => {
  it('flattens action requests across interrupts and defaults missing args', () => {
    expect(
      collectActionRequests([
        {
          value: {
            actionRequests: [
              { name: 'execute', args: { command: 'rm -rf /' } },
              { name: 'write_file' },
            ],
          },
        },
        { value: { actionRequests: [{ name: 'edit_file', args: { a: 1 } }] } },
      ]),
    ).toEqual([
      { name: 'execute', args: { command: 'rm -rf /' } },
      { name: 'write_file', args: {} },
      { name: 'edit_file', args: { a: 1 } },
    ]);
  });

  it('ignores interrupts without action requests', () => {
    expect(
      collectActionRequests([{ value: undefined }, { value: {} }]),
    ).toEqual([]);
  });
});
