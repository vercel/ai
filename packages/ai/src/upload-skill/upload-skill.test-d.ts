import type { SkillsV4 } from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { uploadSkill } from './upload-skill';
import type { UploadSkillResult } from './upload-skill-result';

it('accepts an abort signal', () => {
  const skills = {
    specificationVersion: 'v4',
    provider: 'mock-provider',
    uploadSkill: async () => ({
      providerReference: { 'mock-provider': 'skill-123' },
      warnings: [],
    }),
  } satisfies SkillsV4;

  const result = uploadSkill({
    api: skills,
    files: [{ path: 'SKILL.md', data: '# Example' }],
    abortSignal: new AbortController().signal,
  });

  expectTypeOf(result).toEqualTypeOf<Promise<UploadSkillResult>>();
});
