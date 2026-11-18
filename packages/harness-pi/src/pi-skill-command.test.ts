import { describe, expect, it, vi } from 'vitest';
import { expandPiSkillCommand } from './pi-skill-command';

const skill = {
  name: 'release-notes',
  filePath: '/sandbox/home/.agents/skills/release-notes/SKILL.md',
  baseDir: '/sandbox/home/.agents/skills/release-notes',
};

const skillFile = `---
name: release-notes
description: Use when writing release notes.
---

# Release notes

Use three sections.
`;

function createSandbox(
  readTextFile: (options: {
    path: string;
    abortSignal?: AbortSignal;
  }) => Promise<string | null> = async () => skillFile,
) {
  return { readTextFile: vi.fn(readTextFile) };
}

describe('expandPiSkillCommand', () => {
  it.each(['', 'hello', '/skills', 'see /skill:release-notes', ' /skill:x'])(
    'returns %j unchanged',
    async text => {
      const sandbox = createSandbox();

      expect(
        await expandPiSkillCommand({ text, skills: [skill], sandbox }),
      ).toBe(text);
      expect(sandbox.readTextFile).not.toHaveBeenCalled();
    },
  );

  it('expands a known skill with arguments from the sandbox', async () => {
    const sandbox = createSandbox();

    const result = await expandPiSkillCommand({
      text: '/skill:release-notes Draft notes for v2.',
      skills: [skill],
      sandbox,
    });

    expect(sandbox.readTextFile).toHaveBeenCalledExactlyOnceWith({
      path: skill.filePath,
    });
    expect(result).toMatchInlineSnapshot(`
      "<skill name="release-notes" location="/sandbox/home/.agents/skills/release-notes/SKILL.md">
      References are relative to /sandbox/home/.agents/skills/release-notes.

      # Release notes

      Use three sections.
      </skill>

      Draft notes for v2."
    `);
  });

  it('expands a known skill without arguments', async () => {
    expect(
      await expandPiSkillCommand({
        text: '/skill:release-notes',
        skills: [skill],
        sandbox: createSandbox(),
      }),
    ).toMatchInlineSnapshot(`
      "<skill name="release-notes" location="/sandbox/home/.agents/skills/release-notes/SKILL.md">
      References are relative to /sandbox/home/.agents/skills/release-notes.

      # Release notes

      Use three sections.
      </skill>"
    `);
  });

  it('returns an unknown skill command unchanged', async () => {
    const sandbox = createSandbox();

    expect(
      await expandPiSkillCommand({
        text: '/skill:missing do it',
        skills: [skill],
        sandbox,
      }),
    ).toBe('/skill:missing do it');
    expect(sandbox.readTextFile).not.toHaveBeenCalled();
  });

  it('escapes the command when the skill file is missing in the sandbox', async () => {
    expect(
      await expandPiSkillCommand({
        text: '/skill:release-notes do it',
        skills: [skill],
        sandbox: createSandbox(async () => null),
      }),
    ).toBe(' /skill:release-notes do it');
  });

  it('escapes the command when the sandbox read fails', async () => {
    expect(
      await expandPiSkillCommand({
        text: '/skill:release-notes',
        skills: [skill],
        sandbox: createSandbox(async () => {
          throw new Error('sandbox unavailable');
        }),
      }),
    ).toBe(' /skill:release-notes');
  });

  it('rethrows when the read is aborted', async () => {
    const controller = new AbortController();
    const abortError = new Error('aborted');

    await expect(
      expandPiSkillCommand({
        text: '/skill:release-notes',
        skills: [skill],
        sandbox: createSandbox(async () => {
          controller.abort();
          throw abortError;
        }),
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(abortError);
  });
});
