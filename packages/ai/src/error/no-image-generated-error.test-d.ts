import { expectTypeOf, it } from 'vitest';
import { NoImageGeneratedError, type GenerateImageCall } from '..';

it('exposes optional completed image calls', () => {
  const calls = [] as Array<GenerateImageCall>;
  const error = new NoImageGeneratedError({ calls });

  expectTypeOf(error.calls).toEqualTypeOf<
    Array<GenerateImageCall> | undefined
  >();
});

it('keeps calls optional in the constructor', () => {
  const error = new NoImageGeneratedError({});

  expectTypeOf(error.calls).toEqualTypeOf<
    Array<GenerateImageCall> | undefined
  >();
});
