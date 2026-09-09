import { expectTypeOf } from 'vitest';
import { moonshotai } from './index';

type ModelId = Parameters<typeof moonshotai>[0];

type FirstClassModelId<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;

expectTypeOf<FirstClassModelId<ModelId>>().toEqualTypeOf<
  | 'moonshot-v1-auto'
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'moonshot-v1-8k-vision-preview'
  | 'moonshot-v1-32k-vision-preview'
  | 'moonshot-v1-128k-vision-preview'
  | 'kimi-k2.5'
  | 'kimi-k2.6'
  | 'kimi-k2.7-code'
  | 'kimi-k2.7-code-highspeed'
  | 'kimi-k3'
>();

moonshotai('moonshot-v1-auto');
moonshotai('moonshot-v1-8k-vision-preview');
moonshotai('moonshot-v1-32k-vision-preview');
moonshotai('moonshot-v1-128k-vision-preview');

// Arbitrary, custom, and retired model IDs remain assignable for backwards
// compatibility.
moonshotai('custom-model');
moonshotai('kimi-k2-thinking');
