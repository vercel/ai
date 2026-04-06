import { SkillsV4 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { uploadSkill } from './upload-skill';

function createMockSkillsManager(overrides: Partial<SkillsV4> = {}): SkillsV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock-provider',
    upload: vi.fn().mockResolvedValue({
      providerReference: { 'mock-provider': 'skill_123' },
      warnings: [],
    }),
    ...overrides,
  };
}

describe('uploadSkill', () => {
  it('should delegate to api.upload', async () => {
    const skillsManager = createMockSkillsManager();

    const files = [{ path: 'test.ts', content: 'hello' }];
    await uploadSkill({
      api: skillsManager,
      files,
      displayTitle: 'My Skill',
    });

    expect(skillsManager.upload).toHaveBeenCalledWith({
      files,
      displayTitle: 'My Skill',
      providerOptions: undefined,
    });
  });

  it('should return providerReference and warnings from the skills manager', async () => {
    const skillsManager = createMockSkillsManager({
      upload: vi.fn().mockResolvedValue({
        providerReference: { 'mock-provider': 'skill_123' },
        warnings: [{ type: 'unsupported', feature: 'displayTitle' }],
        providerMetadata: { foo: 'bar' },
      }),
    });

    const result = await uploadSkill({
      api: skillsManager,
      files: [{ path: 'test.ts', content: 'hello' }],
    });

    expect(result.providerReference).toEqual({ 'mock-provider': 'skill_123' });
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "feature": "displayTitle",
          "type": "unsupported",
        },
      ]
    `);
    expect(result.providerMetadata).toEqual({ foo: 'bar' });
  });

  it('should pass providerOptions to the skills manager', async () => {
    const skillsManager = createMockSkillsManager();

    await uploadSkill({
      api: skillsManager,
      files: [{ path: 'test.ts', content: 'hello' }],
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skillsManager.upload).toHaveBeenCalledWith({
      files: [{ path: 'test.ts', content: 'hello' }],
      displayTitle: undefined,
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
