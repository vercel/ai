import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexFileChangeRequiresApproval } from './codex-write-protection';

describe('codexFileChangeRequiresApproval', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'codex-write-protection-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it.each([
    {
      permissionMode: 'allow-all',
      file: '.codex/config.toml',
      approval: false,
    },
    { permissionMode: 'allow-reads', file: 'notes.md', approval: true },
    { permissionMode: 'allow-edits', file: 'notes.md', approval: false },
    {
      permissionMode: 'allow-edits',
      file: '.codex/config.toml',
      approval: true,
    },
    {
      permissionMode: 'allow-edits',
      file: '.agents/skills/test/SKILL.md',
      approval: true,
    },
  ] as const)(
    'requires approval=$approval for $file under $permissionMode',
    async ({ permissionMode, file, approval }) => {
      await expect(
        codexFileChangeRequiresApproval({
          permissionMode,
          workDir,
          paths: [path.join(workDir, file)],
        }),
      ).resolves.toBe(approval);
    },
  );
});
