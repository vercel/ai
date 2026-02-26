import { Experimental_SkillsManagerV1 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { experimental_retrieveSkill } from './experimental-retrieve-skill';

const mockSkill = {
  id: 'skill_123',
  name: 'test-skill',
  description: 'A test skill',
  source: 'upload',
  createdAt: new Date('2024-01-15T10:30:00Z'),
  updatedAt: new Date('2024-01-15T10:30:00Z'),
};

function createMockSkillsManager(
  overrides: Partial<Experimental_SkillsManagerV1> = {},
): Experimental_SkillsManagerV1 {
  return {
    specificationVersion: 'v1',
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

describe('experimental_retrieveSkill', () => {
  it('should delegate to skillsManager.retrieve', async () => {
    const skillsManager = createMockSkillsManager();

    await experimental_retrieveSkill({
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

    const result = await experimental_retrieveSkill({
      skillsManager,
      skillId: 'skill_123',
    });

    expect(result.skill).toMatchInlineSnapshot(`
      {
        "createdAt": 2024-01-15T10:30:00.000Z,
        "description": "A test skill",
        "id": "skill_123",
        "name": "test-skill",
        "source": "upload",
        "updatedAt": 2024-01-15T10:30:00.000Z,
      }
    `);
    expect(result.warnings).toMatchInlineSnapshot(`[]`);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await experimental_retrieveSkill({
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
