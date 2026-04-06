import { SkillsV4 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { deleteSkill } from './delete-skill';

function createMockSkillsManager(overrides: Partial<SkillsV4> = {}): SkillsV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock-provider',
    create: vi.fn(),
    list: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue({
      warnings: [],
    }),
    ...overrides,
  };
}

describe('deleteSkill', () => {
  it('should delegate to skillsManager.delete', async () => {
    const skillsManager = createMockSkillsManager();

    await deleteSkill({
      skillsManager,
      skillId: 'skill_123',
    });

    expect(skillsManager.delete).toHaveBeenCalledWith({
      skillId: 'skill_123',
      providerOptions: undefined,
    });
  });

  it('should return warnings from the skills manager', async () => {
    const skillsManager = createMockSkillsManager({
      delete: vi.fn().mockResolvedValue({
        warnings: [{ type: 'unsupported', feature: 'cascadeDelete' }],
      }),
    });

    const result = await deleteSkill({
      skillsManager,
      skillId: 'skill_123',
    });

    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "feature": "cascadeDelete",
          "type": "unsupported",
        },
      ]
    `);
  });

  it('should return empty warnings on successful delete', async () => {
    const skillsManager = createMockSkillsManager();

    const result = await deleteSkill({
      skillsManager,
      skillId: 'skill_123',
    });

    expect(result.warnings).toMatchInlineSnapshot(`[]`);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await deleteSkill({
      skillsManager,
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.delete).toHaveBeenCalledWith({
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
