import { SkillsV4 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { updateSkill } from './update-skill';

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
    retrieve: vi.fn(),
    update: vi.fn().mockResolvedValue({
      skill: mockSkill,
      warnings: [],
    }),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('updateSkill', () => {
  it('should delegate to skillsManager.update', async () => {
    const skillsManager = createMockSkillsManager();

    const files = [{ path: 'test.ts', content: 'hello' }];
    await updateSkill({
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

    const result = await updateSkill({
      skillsManager,
      skillId: 'skill_123',
      files: [{ path: 'test.ts', content: 'hello' }],
    });

    expect(result.skill).toMatchInlineSnapshot(`
      {
        "description": "A test skill",
        "id": "skill_123",
        "name": "test-skill",
        "source": "upload",
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

    await updateSkill({
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
