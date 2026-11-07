import { expectTypeOf } from 'vitest';
import type { OpenAIChatMessageProviderOptions } from '../index';

expectTypeOf<{ name: string }>().toExtend<OpenAIChatMessageProviderOptions>();
expectTypeOf<{}>().toExtend<OpenAIChatMessageProviderOptions>();
expectTypeOf<{
  name: number;
}>().not.toExtend<OpenAIChatMessageProviderOptions>();
