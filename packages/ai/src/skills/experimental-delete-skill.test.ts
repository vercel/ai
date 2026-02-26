import {
  ProviderV3,
  SkillsManagerV1,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { experimental_deleteSkill } from './experimental-delete-skill';

function createMockSkillsManager(
  overrides: Partial<SkillsManagerV1> = {},
): SkillsManagerV1 {
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

function createMockProvider(skillsManager?: SkillsManagerV1): ProviderV3 {
  return {
    specificationVersion: 'v3',
    languageModel: vi.fn() as any,
    embeddingModel: vi.fn() as any,
    imageModel: vi.fn() as any,
    skillsManager: skillsManager ? () => skillsManager : undefined,
  };
}

describe('experimental_deleteSkill', () => {
  it('should throw UnsupportedFunctionalityError when provider has no skillsManager', async () => {
    const provider = createMockProvider();

    await expect(
      experimental_deleteSkill({
        provider,
        skillId: 'skill_123',
      }),
    ).rejects.toThrow(UnsupportedFunctionalityError);
  });

  it('should delegate to skillsManager.delete', async () => {
    const skillsManager = createMockSkillsManager();
    const provider = createMockProvider(skillsManager);

    await experimental_deleteSkill({
      provider,
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
    const provider = createMockProvider(skillsManager);

    const result = await experimental_deleteSkill({
      provider,
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
    const provider = createMockProvider(skillsManager);

    const result = await experimental_deleteSkill({
      provider,
      skillId: 'skill_123',
    });

    expect(result.warnings).toMatchInlineSnapshot(`[]`);
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();
    const provider = createMockProvider(skillsManager);

    await experimental_deleteSkill({
      provider,
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.delete).toHaveBeenCalledWith({
      skillId: 'skill_123',
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
