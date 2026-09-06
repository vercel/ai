import { expectTypeOf, it } from 'vitest';
import type { DeepSeekFilePartProviderOptions } from '../index';

it('should type DeepSeek file part options', () => {
  const options = {
    imageDetail: 'original',
  } satisfies DeepSeekFilePartProviderOptions;

  expectTypeOf(options.imageDetail).toEqualTypeOf<'original'>();
});

it('should only accept true for fileData', () => {
  const options = {
    // @ts-expect-error - fileData only enables the alternate content part
    fileData: false,
  } satisfies DeepSeekFilePartProviderOptions;

  expectTypeOf(options.fileData).toEqualTypeOf<false>();
});
