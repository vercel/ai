import { Experimental_SkillsManagerV1 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { experimental_createSkill } from './experimental-create-skill';

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
    create: vi.fn().mockResolvedValue({
      skill: mockSkill,
      warnings: [],
    }),
    list: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('experimental_createSkill', () => {
  it('should delegate to skillsManager.create', async () => {
    const skillsManager = createMockSkillsManager();

    const files = [{ path: 'test.ts', content: 'hello' }];
    await experimental_createSkill({
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

    const result = await experimental_createSkill({
      skillsManager,
      files: [{ path: 'test.ts', content: 'hello' }],
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

    await experimental_createSkill({
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
