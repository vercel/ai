import { expectTypeOf } from 'vitest';
import { deepseek } from './index';

type ModelId = Parameters<typeof deepseek>[0];

type FirstClassModelId<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

expectTypeOf<FirstClassModelId<ModelId>>().toEqualTypeOf<
  'deepseek-v4-flash' | 'deepseek-v4-pro' | 'deepseek-v4-flash-vision-exp'
>();

deepseek('deepseek-v4-flash');
deepseek('deepseek-v4-pro');
deepseek('deepseek-v4-flash-vision-exp');

// Arbitrary, custom, and retired model IDs remain assignable for backwards
// compatibility.
deepseek('custom-model');
deepseek('deepseek-chat');
deepseek('deepseek-reasoner');
