import {
  ProviderV3,
  Experimental_SkillsManagerV1,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
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

function createMockProvider(
  skillsManager?: Experimental_SkillsManagerV1,
): ProviderV3 {
  return {
    specificationVersion: 'v3',
    languageModel: vi.fn() as any,
    embeddingModel: vi.fn() as any,
    imageModel: vi.fn() as any,
    skillsManager: skillsManager ? () => skillsManager : undefined,
  };
}

describe('experimental_retrieveSkill', () => {
  it('should throw UnsupportedFunctionalityError when provider has no skillsManager', async () => {
    const provider = createMockProvider();

    await expect(
      experimental_retrieveSkill({
        provider,
        skillId: 'skill_123',
      }),
    ).rejects.toThrow(UnsupportedFunctionalityError);
  });

  it('should delegate to skillsManager.retrieve', async () => {
    const skillsManager = createMockSkillsManager();
    const provider = createMockProvider(skillsManager);

    await experimental_retrieveSkill({
      provider,
      skillId: 'skill_123',
    });

    expect(skillsManager.retrieve).toHaveBeenCalledWith({
      skillId: 'skill_123',
      providerOptions: undefined,
    });
  });

  it('should return skill and warnings from the skills manager', async () => {
    const skillsManager = createMockSkillsManager();
    const provider = createMockProvider(skillsManager);

    const result = await experimental_retrieveSkill({
      provider,
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
    const provider = createMockProvider(skillsManager);

    await experimental_retrieveSkill({
      provider,
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.retrieve).toHaveBeenCalledWith({
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
