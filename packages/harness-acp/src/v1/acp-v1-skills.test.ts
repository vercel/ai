import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACP_SKILLS_DIRECTORY,
  resolveACPSkillsDirectory,
  validateACPSkills,
} from './acp-v1-skills';

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

describe('validateACPSkills', () => {
  it('validates valid skills and files without throwing', () => {
    expect(() => validateACPSkills({ skills: [skill] })).not.toThrow();
  });

  it.each([
    {
      name: 'absolute path',
      files: [{ path: '/escape.md', content: '' }],
      error: 'relative POSIX path',
    },
    {
      name: 'Windows absolute path',
      files: [{ path: 'C:\\\\escape.md', content: '' }],
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
  ])('rejects $name', ({ files, error }) => {
    expect(() => validateACPSkills({ skills: [{ ...skill, files }] })).toThrow(
      error,
    );
  });

  it('rejects invalid and duplicate skill names', () => {
    expect(() =>
      validateACPSkills({ skills: [{ ...skill, name: '../release-notes' }] }),
    ).toThrow('Invalid ACP skill name');

    expect(() => validateACPSkills({ skills: [skill, skill] })).toThrow(
      'Duplicate ACP skill name',
    );
  });
});

describe('resolveACPSkillsDirectory', () => {
  it('uses the standard directory by default', () => {
    expect(
      resolveACPSkillsDirectory({
        implementationHomeDir: '/home/agent',
      }),
    ).toBe(`/home/agent/${DEFAULT_ACP_SKILLS_DIRECTORY}`);
  });

  it('resolves a runtime-specific directory relative to implementation home', () => {
    expect(
      resolveACPSkillsDirectory({
        implementationHomeDir: '/home/agent',
        skillsDirectory: '.claude/skills',
      }),
    ).toBe('/home/agent/.claude/skills');
  });

  it.each([
    '',
    '.',
    '/skills',
    'C:\\\\skills',
    '.agents\\\\skills',
    '../skills',
  ])('rejects invalid directory %j', skillsDirectory => {
    expect(() =>
      resolveACPSkillsDirectory({
        implementationHomeDir: '/home/agent',
        skillsDirectory,
      }),
    ).toThrow('must be a relative POSIX path without traversal');
  });
});
