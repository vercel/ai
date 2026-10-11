import { expectTypeOf, it } from 'vitest';
import type { HumeSpeechModelOptions } from './hume-speech-model-options';

it('supports explicit Octave versions', () => {
  const octave1 = {
    version: '1',
  } satisfies HumeSpeechModelOptions;
  const octave2 = {
    version: '2',
  } satisfies HumeSpeechModelOptions;

  expectTypeOf(octave1.version).toEqualTypeOf<'1'>();
  expectTypeOf(octave2.version).toEqualTypeOf<'2'>();
  expectTypeOf<HumeSpeechModelOptions['version']>().toEqualTypeOf<
    '1' | '2' | undefined
  >();
});

it('rejects unsupported Octave versions', () => {
  const options = {
    // @ts-expect-error Octave only supports versions 1 and 2.
    version: '3',
  } satisfies HumeSpeechModelOptions;

  expectTypeOf(options.version).toEqualTypeOf<'3'>();
});
