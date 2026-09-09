import { expectTypeOf } from 'vitest';
import { deepSeek } from './index';

type ModelId = Parameters<typeof deepSeek>[0];

type FirstClassModelId<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

expectTypeOf<FirstClassModelId<ModelId>>().toEqualTypeOf<
  'deepseek-v4-flash' | 'deepseek-v4-pro' | 'deepseek-v4-flash-vision-exp'
>();

deepSeek('deepseek-v4-flash');
deepSeek('deepseek-v4-pro');
deepSeek('deepseek-v4-flash-vision-exp');

// Arbitrary, custom, and retired model IDs remain assignable for backwards
// compatibility.
deepSeek('custom-model');
deepSeek('deepseek-chat');
deepSeek('deepseek-reasoner');
