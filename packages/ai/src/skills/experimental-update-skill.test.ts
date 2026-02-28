import { Experimental_SkillsManagerV1 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { experimental_updateSkill } from './experimental-update-skill';

const mockSkill = {
  id: 'skill_123',
  name: 'test-skill',
  description: 'A test skill',
  source: 'upload',
  createdAt: new Date('2024-01-15T10:30:00Z'),
  updatedAt: new Date('2024-01-16T12:00:00Z'),
};

function createMockSkillsManager(
  overrides: Partial<Experimental_SkillsManagerV1> = {},
): Experimental_SkillsManagerV1 {
  return {
    specificationVersion: 'v1',
    provider: 'mock-provider',
    create: vi.fn(),
    list: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn().mockResolvedValue({
      skill: mockSkill,
      warnings: [],
    }),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('experimental_updateSkill', () => {
  it('should delegate to skillsManager.update', async () => {
    const skillsManager = createMockSkillsManager();

    const files = [{ path: 'test.ts', content: 'hello' }];
    await experimental_updateSkill({
      skillsManager,
      skillId: 'skill_123',
      files,
    });

    expect(skillsManager.update).toHaveBeenCalledWith({
      skillId: 'skill_123',
      files,
      providerOptions: undefined,
    });
  });

  it('should return skill and warnings from the skills manager', async () => {
    const skillsManager = createMockSkillsManager({
      update: vi.fn().mockResolvedValue({
        skill: mockSkill,
        warnings: [{ type: 'unsupported', feature: 'someFeature' }],
      }),
    });

    const result = await experimental_updateSkill({
      skillsManager,
      skillId: 'skill_123',
      files: [{ path: 'test.ts', content: 'hello' }],
    });

    expect(result.skill).toMatchInlineSnapshot(`
      {
        "createdAt": 2024-01-15T10:30:00.000Z,
        "description": "A test skill",
        "id": "skill_123",
        "name": "test-skill",
        "source": "upload",
        "updatedAt": 2024-01-16T12:00:00.000Z,
      }
    `);
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "feature": "someFeature",
          "type": "unsupported",
        },
      ]
    `);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await experimental_updateSkill({
      skillsManager,
      skillId: 'skill_123',
      files: [{ path: 'test.ts', content: 'hello' }],
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.update).toHaveBeenCalledWith({
      skillId: 'skill_123',
      files: [{ path: 'test.ts', content: 'hello' }],
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
