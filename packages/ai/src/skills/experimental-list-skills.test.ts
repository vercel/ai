import { Experimental_SkillsManagerV1 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { experimental_listSkills } from './experimental-list-skills';

const mockSkills = [
  {
    id: 'skill_123',
    name: 'test-skill',
    description: 'A test skill',
    source: 'upload',
  },
  {
    id: 'skill_456',
    name: 'another-skill',
    description: 'Another skill',
    source: 'upload',
  },
];

function createMockSkillsManager(
  overrides: Partial<Experimental_SkillsManagerV1> = {},
): Experimental_SkillsManagerV1 {
  return {
    specificationVersion: 'v1',
    provider: 'mock-provider',
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({
      skills: mockSkills,
      warnings: [],
    }),
    retrieve: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('experimental_listSkills', () => {
  it('should delegate to skillsManager.list', async () => {
    const skillsManager = createMockSkillsManager();

    await experimental_listSkills({ skillsManager });

    expect(skillsManager.list).toHaveBeenCalledWith({
      providerOptions: undefined,
    });
  });

  it('should return skills and warnings from the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    const result = await experimental_listSkills({ skillsManager });

    expect(result.skills).toMatchInlineSnapshot(`
      [
        {
          "description": "A test skill",
          "id": "skill_123",
          "name": "test-skill",
          "source": "upload",
        },
        {
          "description": "Another skill",
          "id": "skill_456",
          "name": "another-skill",
          "source": "upload",
        },
      ]
    `);
    expect(result.warnings).toMatchInlineSnapshot(`[]`);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await experimental_listSkills({
      skillsManager,
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.list).toHaveBeenCalledWith({
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
