import { expectTypeOf, it } from 'vitest';
import type { SkillsV4UploadSkillCallOptions } from './skills-v4-upload-skill-call-options';

it('accepts an optional abort signal', () => {
  expectTypeOf<SkillsV4UploadSkillCallOptions['abortSignal']>().toEqualTypeOf<
    AbortSignal | undefined
  >();

  const abortSignal = new AbortController().signal;
  const options = {
    files: [],
    abortSignal,
  } satisfies SkillsV4UploadSkillCallOptions;

  expectTypeOf(options.abortSignal).toEqualTypeOf<AbortSignal>();
});
