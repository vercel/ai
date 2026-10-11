import { expectTypeOf, it } from 'vitest';
import { InvalidToolInputError } from '..';

it('exports InvalidToolInputError with truncation metadata', () => {
  const error = new InvalidToolInputError({
    toolName: 'weather',
    toolInput: '{"location":"San',
    cause: new Error('invalid input'),
    truncated: true,
  });

  expectTypeOf(error.truncated).toEqualTypeOf<boolean>();

  new InvalidToolInputError({
    toolName: 'weather',
    toolInput: 'invalid',
    cause: new Error('invalid input'),
  });
});
