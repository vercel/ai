import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  createACPSkillsFingerprint,
  materializeACPSkills,
} from './acp-v1-skills';

function makeSandbox({
  runs,
  writes,
}: {
  runs: string[];
  writes: Array<{ path: string; content: string }>;
}): Experimental_SandboxSession {
  return {
    async run({ command }: { command: string }) {
      runs.push(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      writes.push({ path, content });
    },
  } as unknown as Experimental_SandboxSession;
}

const skill = {
  name: 'release-notes',
  description: 'Prepare release notes.',
  content: 'Complete private skill content.',
  files: [
    {
      path: 'references/style.md',
      content: 'Use active voice.',
    },
  ],
} as const;

describe('materializeACPSkills', () => {
  it('writes complete skills beneath sandbox home and returns a compact catalog', async () => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const result = await materializeACPSkills({
      sandbox: makeSandbox({ runs, writes }),
      sandboxHomeDir: '/home/agent',
      sessionWorkDir: '/workspace/project',
      harnessId: 'portable-acp',
      sessionId: '../../untrusted-session',
      skills: [skill],
      shouldMaterialize: true,
    });

    expect(result.rootDir).toMatch(
      /^\/home\/agent\/\.ai-sdk\/harness-acp\/portable-acp\/[a-f0-9]{64}\/skills$/,
    );
    expect(result.rootDir).not.toContain('untrusted-session');
    expect(runs).toEqual([`mkdir -p '${result.rootDir}'`]);
    expect(writes).toEqual([
      {
        path: `${result.rootDir}/release-notes/SKILL.md`,
        content:
          '---\n' +
          'name: release-notes\n' +
          'description: Prepare release notes.\n' +
          '---\n\n' +
          'Complete private skill content.',
      },
      {
        path: `${result.rootDir}/release-notes/references/style.md`,
        content: 'Use active voice.',
      },
    ]);
    expect(result.catalog).toEqual([
      {
        name: 'release-notes',
        description: 'Prepare release notes.',
        path: `${result.rootDir}/release-notes/SKILL.md`,
      },
    ]);
    expect(JSON.stringify(result.catalog)).not.toContain(
      'Complete private skill content.',
    );
    expect(JSON.stringify(result.catalog)).not.toContain('Use active voice.');
  });

  it.each([
    {
      name: 'absolute path',
      files: [{ path: '/escape.md', content: '' }],
      error: 'relative POSIX path',
    },
    {
      name: 'Windows absolute path',
      files: [{ path: 'C:\\escape.md', content: '' }],
      error: 'relative POSIX path',
    },
    {
      name: 'parent path',
      files: [{ path: '../escape.md', content: '' }],
      error: 'relative POSIX path',
    },
    {
      name: 'normalized-away traversal',
      files: [{ path: 'references/../escape.md', content: '' }],
      error: 'relative POSIX path',
    },
    {
      name: 'reserved skill definition',
      files: [{ path: './SKILL.md', content: '' }],
      error: 'SKILL.md is reserved',
    },
    {
      name: 'duplicate normalized path',
      files: [
        { path: 'references/./style.md', content: '' },
        { path: 'references/style.md', content: '' },
      ],
      error: 'Duplicate ACP skill file path',
    },
  ])('rejects $name before writing', async ({ files, error }) => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    await expect(
      materializeACPSkills({
        sandbox: makeSandbox({ runs, writes }),
        sandboxHomeDir: '/home/agent',
        sessionWorkDir: '/workspace/project',
        harnessId: 'portable-acp',
        sessionId: 'session',
        skills: [{ ...skill, files }],
        shouldMaterialize: true,
      }),
    ).rejects.toThrow(error);
    expect(runs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('rejects invalid and duplicate skill names before writing', async () => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const sandbox = makeSandbox({ runs, writes });

    await expect(
      materializeACPSkills({
        sandbox,
        sandboxHomeDir: '/home/agent',
        sessionWorkDir: '/workspace/project',
        harnessId: 'portable-acp',
        sessionId: 'session',
        skills: [{ ...skill, name: '../release-notes' }],
        shouldMaterialize: true,
      }),
    ).rejects.toThrow('Invalid ACP skill name');
    await expect(
      materializeACPSkills({
        sandbox,
        sandboxHomeDir: '/home/agent',
        sessionWorkDir: '/workspace/project',
        harnessId: 'portable-acp',
        sessionId: 'session',
        skills: [skill, skill],
        shouldMaterialize: true,
      }),
    ).rejects.toThrow('Duplicate ACP skill name');
    expect(runs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('rejects an owned root inside the project workspace', async () => {
    await expect(
      materializeACPSkills({
        sandbox: makeSandbox({ runs: [], writes: [] }),
        sandboxHomeDir: '/workspace/project',
        sessionWorkDir: '/workspace/project',
        harnessId: 'portable-acp',
        sessionId: 'session',
        skills: [skill],
        shouldMaterialize: true,
      }),
    ).rejects.toThrow('must be outside sessionWorkDir');
  });

  it('can reconstruct the catalog without rewriting matching resumed skills', async () => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const result = await materializeACPSkills({
      sandbox: makeSandbox({ runs, writes }),
      sandboxHomeDir: '/home/agent',
      sessionWorkDir: '/workspace/project',
      harnessId: 'portable-acp',
      sessionId: 'session',
      skills: [skill],
      shouldMaterialize: false,
    });

    expect(result.catalog).toHaveLength(1);
    expect(runs).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe('createACPSkillsFingerprint', () => {
  it('changes when skill contents change without exposing them', () => {
    const first = createACPSkillsFingerprint({ skills: [skill] });
    const second = createACPSkillsFingerprint({
      skills: [{ ...skill, content: 'Changed content.' }],
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(skill.content);
  });

  it('is stable across object construction and catalog ordering', () => {
    const otherSkill = {
      content: 'Other content.',
      description: 'Use another workflow.',
      name: 'other-workflow',
      files: [
        { content: 'Second', path: 'references/second.md' },
        { content: 'First', path: 'references/first.md' },
      ],
    } as const;
    const reorderedSkill = {
      files: [
        { path: 'references/first.md', content: 'First' },
        { path: 'references/second.md', content: 'Second' },
      ],
      name: 'other-workflow',
      content: 'Other content.',
      description: 'Use another workflow.',
    } as const;

    expect(createACPSkillsFingerprint({ skills: [skill, otherSkill] })).toBe(
      createACPSkillsFingerprint({
        skills: [reorderedSkill, { ...skill }],
      }),
    );
  });
});
