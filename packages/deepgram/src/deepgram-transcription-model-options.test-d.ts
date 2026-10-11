import { describe, expectTypeOf, it } from 'vitest';
import type { DeepgramTranscriptionModelOptions } from '.';

describe('DeepgramTranscriptionModelOptions', () => {
  it('accepts one keyterm', () => {
    const options = {
      keyterm: 'Galileo',
    } satisfies DeepgramTranscriptionModelOptions;

    expectTypeOf(options).toMatchTypeOf<DeepgramTranscriptionModelOptions>();
  });

  it('accepts multiple keyterms', () => {
    const options = {
      keyterm: ['Galileo', 'Jupiter'],
    } satisfies DeepgramTranscriptionModelOptions;

    expectTypeOf(options).toMatchTypeOf<DeepgramTranscriptionModelOptions>();
  });

  it('rejects non-string keyterm values', () => {
    const options: DeepgramTranscriptionModelOptions = {
      // @ts-expect-error keyterms must be strings
      keyterm: ['Galileo', 42],
    };
    options;
  });
});
