import { SkillsV4 } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';
import { uploadSkill } from './upload-skill';

function createMockSkills(overrides: Partial<SkillsV4> = {}): SkillsV4 {
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
    const skills = createMockSkills();

    const files = [{ path: 'test.ts', content: 'hello' }];
    await uploadSkill({
      api: skills,
      files,
      displayTitle: 'My Skill',
    });

    expect(skills.upload).toHaveBeenCalledWith({
      files,
      displayTitle: 'My Skill',
      providerOptions: undefined,
    });
  });

  it('should return providerReference and warnings from the skills', async () => {
    const skills = createMockSkills({
      upload: vi.fn().mockResolvedValue({
        providerReference: { 'mock-provider': 'skill_123' },
        warnings: [{ type: 'unsupported', feature: 'displayTitle' }],
        providerMetadata: { foo: 'bar' },
      }),
    });

    const result = await uploadSkill({
      api: skills,
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

  it('should pass providerOptions to the skills', async () => {
    const skills = createMockSkills();

    await uploadSkill({
      api: skills,
      files: [{ path: 'test.ts', content: 'hello' }],
      providerOptions: { openai: { custom: 'value' } },
    });

    expect(skills.upload).toHaveBeenCalledWith({
      files: [{ path: 'test.ts', content: 'hello' }],
      displayTitle: undefined,
      providerOptions: { openai: { custom: 'value' } },
    });
  });
});
