import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACP_SKILLS_DIRECTORY,
  materializeACPSkills,
  resolveACPSkillsDirectory,
} from './acp-v1-skills';

function makeSandbox({
  runs,
  writes,
}: {
  runs: string[];
  writes: Array<{ path: string; content: string }>;
}): Experimental_SandboxSession {
  const files = new Map<string, string>();
  return {
    async run({ command }: { command: string }) {
      runs.push(command);
      const manifestMove = command.match(/^mv -f '([^']+)' '([^']+)'$/);
      if (manifestMove != null) {
        const content = files.get(manifestMove[1]!);
        if (content != null) files.set(manifestMove[2]!, content);
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    async readTextFile({ path }: { path: string }) {
      return files.get(path);
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      writes.push({ path, content });
      files.set(path, content);
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
  it('writes complete skills to the resolved native directory', async () => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const rootDir = '/home/agent/.agents/skills';
    const result = await materializeACPSkills({
      sandbox: makeSandbox({ runs, writes }),
      rootDir,
      sessionWorkDir: '/workspace/project',
      skills: [skill],
    });

    expect(result).toEqual({
      changed: true,
      written: ['release-notes'],
      removed: [],
      unchanged: [],
    });
    expect(runs).toContain(`mkdir -p '${rootDir}'`);
    const skillWrites = writes.filter(write =>
      write.path.includes('/release-notes/'),
    );
    expect(skillWrites).toEqual(
      expect.arrayContaining([
        {
          path: `${rootDir}/release-notes/SKILL.md`,
          content:
            '---\n' +
            'name: release-notes\n' +
            'description: Prepare release notes.\n' +
            '---\n\n' +
            'Complete private skill content.',
        },
        {
          path: `${rootDir}/release-notes/references/style.md`,
          content: 'Use active voice.',
        },
      ]),
    );
    expect(skillWrites).toHaveLength(2);
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
        rootDir: '/home/agent/.agents/skills',
        sessionWorkDir: '/workspace/project',
        skills: [{ ...skill, files }],
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
        rootDir: '/home/agent/.agents/skills',
        sessionWorkDir: '/workspace/project',
        skills: [{ ...skill, name: '../release-notes' }],
      }),
    ).rejects.toThrow('Invalid ACP skill name');
    await expect(
      materializeACPSkills({
        sandbox,
        rootDir: '/home/agent/.agents/skills',
        sessionWorkDir: '/workspace/project',
        skills: [skill, skill],
      }),
    ).rejects.toThrow('Duplicate ACP skill name');
    expect(runs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('rejects an owned root inside the project workspace', async () => {
    await expect(
      materializeACPSkills({
        sandbox: makeSandbox({ runs: [], writes: [] }),
        rootDir: '/workspace/project/.agents/skills',
        sessionWorkDir: '/workspace/project',
        skills: [skill],
      }),
    ).rejects.toThrow('must be outside sessionWorkDir');
  });

  it('does not rewrite matching resumed skills', async () => {
    const runs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const sandbox = makeSandbox({ runs, writes });
    const input = {
      sandbox,
      rootDir: '/home/agent/.agents/skills',
      sessionWorkDir: '/workspace/project',
      skills: [skill],
    } as const;
    await materializeACPSkills(input);
    const writesAfterFirstCall = writes.length;
    const runsAfterFirstCall = runs.length;
    const result = await materializeACPSkills(input);

    expect(result).toEqual({
      changed: false,
      written: [],
      removed: [],
      unchanged: ['release-notes'],
    });
    expect(writes).toHaveLength(writesAfterFirstCall);
    expect(runs).toHaveLength(runsAfterFirstCall);
  });
});

describe('resolveACPSkillsDirectory', () => {
  it('uses the standard directory by default', () => {
    expect(
      resolveACPSkillsDirectory({
        implementationHomeDir: '/home/agent',
        sessionWorkDir: '/workspace/project',
      }),
    ).toBe(`/home/agent/${DEFAULT_ACP_SKILLS_DIRECTORY}`);
  });

  it('resolves a runtime-specific directory relative to implementation home', () => {
    expect(
      resolveACPSkillsDirectory({
        implementationHomeDir: '/home/agent',
        skillsDirectory: '.claude/skills',
        sessionWorkDir: '/workspace/project',
      }),
    ).toBe('/home/agent/.claude/skills');
  });

  it.each(['', '.', '/skills', 'C:\\skills', '.agents\\skills', '../skills'])(
    'rejects invalid directory %j',
    skillsDirectory => {
      expect(() =>
        resolveACPSkillsDirectory({
          implementationHomeDir: '/home/agent',
          skillsDirectory,
          sessionWorkDir: '/workspace/project',
        }),
      ).toThrow('must be a relative POSIX path without traversal');
    },
  );
});
