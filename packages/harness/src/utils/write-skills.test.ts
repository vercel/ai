import { describe, expect, it } from 'vitest';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { writeSkills } from './write-skills';

function makeSandbox() {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  const runs: string[] = [];
  const writes: Array<{ path: string; content: string }> = [];

  const sandbox = {
    async run({ command }: { command: string }) {
      runs.push(command);
      if (command.startsWith('test ! -e ')) {
        const [target] = quotedValues(command);
        const exists =
          directories.has(target!) ||
          Array.from(files).some(([filePath]) =>
            filePath.startsWith(`${target}/`),
          );
        return { exitCode: exists ? 1 : 0, stdout: '', stderr: '' };
      }
      if (command.startsWith('mv -f ')) {
        const [source, target] = quotedValues(command);
        files.set(target!, files.get(source!)!);
        files.delete(source!);
      }
      if (command.startsWith('rm -rf -- ')) {
        for (const target of quotedValues(command)) {
          directories.delete(target);
          for (const filePath of files.keys()) {
            if (filePath === target || filePath.startsWith(`${target}/`)) {
              files.delete(filePath);
            }
          }
        }
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    async readTextFile({ path }: { path: string }) {
      return files.get(path) ?? null;
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      writes.push({ path, content });
      files.set(path, content);
      const skillDirectory = path.match(/^(.+\/skills\/[^/]+)\//)?.[1];
      if (skillDirectory != null) directories.add(skillDirectory);
    },
  } as unknown as Experimental_SandboxSession;

  return { sandbox, files, directories, runs, writes };
}

function quotedValues(command: string): string[] {
  return Array.from(command.matchAll(/'([^']*)'/g), match => match[1]!);
}

const demoSkill = {
  name: 'demo',
  description: 'Demo skill.',
  content: 'Use reference.md.',
  files: [{ path: 'reference.md', content: '# Reference' }],
};

describe('writeSkills', () => {
  it('writes skills and a completed ownership manifest', async () => {
    const state = makeSandbox();
    const result = await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/home/user/.agents/skills',
      skills: [demoSkill],
    });

    expect(result).toEqual({
      changed: true,
      written: ['demo'],
      removed: [],
      unchanged: [],
    });
    expect(state.files.get('/home/user/.agents/skills/demo/SKILL.md')).toBe(
      '---\nname: demo\ndescription: Demo skill.\n---\n\nUse reference.md.',
    );
    expect(state.files.get('/home/user/.agents/skills/demo/reference.md')).toBe(
      '# Reference',
    );
    expect(
      JSON.parse(
        state.files.get(
          '/home/user/.agents/skills/.ai-sdk-harness-skills.json',
        )!,
      ),
    ).toMatchInlineSnapshot(`
      {
        "skills": [
          {
            "hash": "c14ffcc71e9d9c39fb21765d4ac61acd2fc428e973a224e6f20d76f23aa3954b",
            "name": "demo",
          },
        ],
        "state": "complete",
        "version": 1,
      }
    `);
  });

  it('does not write or delete anything when all skill hashes match', async () => {
    const state = makeSandbox();
    await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/skills',
      skills: [demoSkill],
    });
    const writeCount = state.writes.length;
    const runCount = state.runs.length;

    const result = await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/skills',
      skills: [demoSkill],
    });

    expect(result).toEqual({
      changed: false,
      written: [],
      removed: [],
      unchanged: ['demo'],
    });
    expect(state.writes).toHaveLength(writeCount);
    expect(state.runs.slice(runCount)).toEqual([]);
  });

  it('replaces changed skills and removes only manifest-owned skills', async () => {
    const state = makeSandbox();
    state.directories.add('/skills/external');
    state.files.set('/skills/external/SKILL.md', 'external');
    await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/skills',
      skills: [
        demoSkill,
        { name: 'old', description: 'Old.', content: 'Old.' },
      ],
    });

    const result = await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/skills',
      skills: [{ ...demoSkill, content: 'Changed.' }],
    });

    expect(result).toEqual({
      changed: true,
      written: ['demo'],
      removed: ['old'],
      unchanged: [],
    });
    expect(state.files.get('/skills/demo/SKILL.md')).toContain('Changed.');
    expect(state.files.has('/skills/old/SKILL.md')).toBe(false);
    expect(state.files.get('/skills/external/SKILL.md')).toBe('external');
  });

  it('sorts result and manifest entries by skill name', async () => {
    const state = makeSandbox();
    const result = await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/skills',
      skills: [
        { name: 'zeta', description: 'Z.', content: 'Z.' },
        { name: 'alpha', description: 'A.', content: 'A.' },
      ],
    });

    expect(result.written).toEqual(['alpha', 'zeta']);
    const manifest = JSON.parse(
      state.files.get('/skills/.ai-sdk-harness-skills.json')!,
    );
    expect(
      manifest.skills.map((skill: { name: string }) => skill.name),
    ).toEqual(['alpha', 'zeta']);
  });

  it('rejects collisions with skill directories not owned by the manifest', async () => {
    const state = makeSandbox();
    state.directories.add('/skills/demo');

    await expect(
      writeSkills({
        sandbox: state.sandbox,
        rootDir: '/skills',
        skills: [demoSkill],
      }),
    ).rejects.toThrow('already exists and is not owned');
    expect(state.files.has('/skills/.ai-sdk-harness-skills.json')).toBe(false);
  });

  it('recovers a pending update by clearing every recorded directory', async () => {
    const state = makeSandbox();
    state.files.set(
      '/skills/.ai-sdk-harness-skills.json',
      JSON.stringify({
        version: 1,
        state: 'pending',
        skills: [
          { name: 'demo', hash: 'a'.repeat(64) },
          { name: 'old', hash: 'b'.repeat(64) },
        ],
      }),
    );
    state.files.set('/skills/demo/partial.txt', 'partial');
    state.files.set('/skills/old/SKILL.md', 'old');

    const result = await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/skills',
      skills: [demoSkill],
    });

    expect(result).toEqual({
      changed: true,
      written: ['demo'],
      removed: ['old'],
      unchanged: [],
    });
    expect(state.files.has('/skills/demo/partial.txt')).toBe(false);
    expect(state.files.has('/skills/old/SKILL.md')).toBe(false);
    expect(state.files.has('/skills/demo/SKILL.md')).toBe(true);
  });

  it('validates all skill paths before writing', async () => {
    const state = makeSandbox();
    await expect(
      writeSkills({
        sandbox: state.sandbox,
        rootDir: '/skills',
        skills: [
          {
            ...demoSkill,
            files: [{ path: '../reference.md', content: '# Reference' }],
          },
        ],
      }),
    ).rejects.toThrow('Invalid skill file path');
    expect(state.runs).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it('supports stricter skill-name patterns', async () => {
    await expect(
      writeSkills({
        sandbox: makeSandbox().sandbox,
        rootDir: '/skills',
        skillNamePattern: /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/,
        invalidSkillNameMessage: ({ name }) =>
          `Invalid deepagents skill name '${name}': must be lowercase alphanumeric with hyphens, 1-64 chars.`,
        skills: [{ name: 'Demo', description: 'Demo.', content: 'Demo.' }],
      }),
    ).rejects.toThrow("Invalid deepagents skill name 'Demo'");
  });

  it('can strip leading slashes from attached file paths', async () => {
    const state = makeSandbox();
    await writeSkills({
      sandbox: state.sandbox,
      rootDir: '/skills',
      filePathMode: 'strip-leading-slashes',
      skills: [
        {
          name: 'demo',
          description: 'Demo.',
          content: 'Demo.',
          files: [{ path: '/reference.md', content: '# Reference' }],
        },
      ],
    });
    expect(state.files.get('/skills/demo/reference.md')).toBe('# Reference');
  });
});
