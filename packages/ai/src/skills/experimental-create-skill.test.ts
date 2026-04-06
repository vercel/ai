import { SkillsV4 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { createSkill } from './create-skill';

const mockSkill = {
  id: 'skill_123',
  name: 'test-skill',
  description: 'A test skill',
  source: 'upload',
};

function createMockSkillsManager(overrides: Partial<SkillsV4> = {}): SkillsV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock-provider',
    create: vi.fn().mockResolvedValue({
      skill: mockSkill,
      warnings: [],
    }),
    ...overrides,
  };
}

describe('createSkill', () => {
  it('should delegate to skillsManager.create', async () => {
    const skillsManager = createMockSkillsManager();

    const files = [{ path: 'test.ts', content: 'hello' }];
    await createSkill({
      skillsManager,
      files,
      displayTitle: 'My Skill',
    });

    expect(skillsManager.create).toHaveBeenCalledWith({
      files,
      displayTitle: 'My Skill',
      providerOptions: undefined,
    });
  });

  it('should return skill and warnings from the skills manager', async () => {
    const skillsManager = createMockSkillsManager({
      create: vi.fn().mockResolvedValue({
        skill: mockSkill,
        warnings: [{ type: 'unsupported', feature: 'displayTitle' }],
      }),
    });

    const result = await createSkill({
      skillsManager,
      files: [{ path: 'test.ts', content: 'hello' }],
    });

    expect(result.skill).toMatchInlineSnapshot(`
      {
        "description": "A test skill",
        "id": "skill_123",
        "name": "test-skill",
        "source": "upload",
      }
    `);
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "feature": "displayTitle",
          "type": "unsupported",
        },
      ]
    `);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await createSkill({
      skillsManager,
      files: [{ path: 'test.ts', content: 'hello' }],
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.create).toHaveBeenCalledWith({
      files: [{ path: 'test.ts', content: 'hello' }],
      displayTitle: undefined,
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
