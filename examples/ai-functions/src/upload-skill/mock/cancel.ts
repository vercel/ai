import type { SkillsV4 } from '@ai-sdk/provider';
import { uploadSkill } from 'ai';
import { run } from '../../lib/run';

const skills: SkillsV4 = {
  specificationVersion: 'v4',
  provider: 'mock',
  async uploadSkill({ abortSignal }) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 1_000);

      abortSignal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(abortSignal.reason);
        },
        { once: true },
      );
    });

    return {
      providerReference: { mock: 'skill-123' },
      warnings: [],
    };
  },
};

run(async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error('Skill upload cancelled')), 10);

  try {
    await uploadSkill({
      api: skills,
      files: [
        {
          path: 'SKILL.md',
          data: { type: 'text', text: '# Example' },
        },
      ],
      abortSignal: controller.signal,
    });
  } catch (error) {
    console.log(error instanceof Error ? error.message : error);
  }
});
