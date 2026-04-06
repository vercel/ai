import { SkillsV4 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { retrieveSkill } from './retrieve-skill';

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
    create: vi.fn(),
    list: vi.fn(),
    retrieve: vi.fn().mockResolvedValue({
      skill: mockSkill,
      warnings: [],
    }),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('retrieveSkill', () => {
  it('should delegate to skillsManager.retrieve', async () => {
    const skillsManager = createMockSkillsManager();

    await retrieveSkill({
      skillsManager,
      skillId: 'skill_123',
    });

    expect(skillsManager.retrieve).toHaveBeenCalledWith({
      skillId: 'skill_123',
      providerOptions: undefined,
    });
  });

  it('should return skill and warnings from the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    const result = await retrieveSkill({
      skillsManager,
      skillId: 'skill_123',
    });

    expect(result.skill).toMatchInlineSnapshot(`
      {
        "description": "A test skill",
        "id": "skill_123",
        "name": "test-skill",
        "source": "upload",
      }
    `);
    expect(result.warnings).toMatchInlineSnapshot(`[]`);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await retrieveSkill({
      skillsManager,
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.retrieve).toHaveBeenCalledWith({
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
