import { Experimental_SkillsManagerV1 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { experimental_deleteSkill } from './experimental-delete-skill';

function createMockSkillsManager(
  overrides: Partial<Experimental_SkillsManagerV1> = {},
): Experimental_SkillsManagerV1 {
  return {
    specificationVersion: 'v1',
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

describe('experimental_deleteSkill', () => {
  it('should delegate to skillsManager.delete', async () => {
    const skillsManager = createMockSkillsManager();

    await experimental_deleteSkill({
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

    const result = await experimental_deleteSkill({
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

    const result = await experimental_deleteSkill({
      skillsManager,
      skillId: 'skill_123',
    });

    expect(result.warnings).toMatchInlineSnapshot(`[]`);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await experimental_deleteSkill({
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
