import {
  ProviderV3,
  SkillsManagerV1,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
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
  overrides: Partial<SkillsManagerV1> = {},
): SkillsManagerV1 {
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

function createMockProvider(skillsManager?: SkillsManagerV1): ProviderV3 {
  return {
    specificationVersion: 'v3',
    languageModel: vi.fn() as any,
    embeddingModel: vi.fn() as any,
    imageModel: vi.fn() as any,
    skillsManager: skillsManager ? () => skillsManager : undefined,
  };
}

describe('experimental_createSkill', () => {
  it('should throw UnsupportedFunctionalityError when provider has no skillsManager', async () => {
    const provider = createMockProvider();

    await expect(
      experimental_createSkill({
        provider,
        files: [{ path: 'test.ts', content: 'hello' }],
      }),
    ).rejects.toThrow(UnsupportedFunctionalityError);
  });

  it('should delegate to skillsManager.create', async () => {
    const skillsManager = createMockSkillsManager();
    const provider = createMockProvider(skillsManager);

    const files = [{ path: 'test.ts', content: 'hello' }];
    await experimental_createSkill({
      provider,
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
    const provider = createMockProvider(skillsManager);

    const result = await experimental_createSkill({
      provider,
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
    const provider = createMockProvider(skillsManager);

    await experimental_createSkill({
      provider,
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
