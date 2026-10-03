import type { HarnessV1 } from '@ai-sdk/harness';
import { expectTypeOf } from 'vitest';
import { createJcode, type JcodeHarnessSettings } from './index';

expectTypeOf(createJcode()).toMatchTypeOf<HarnessV1>();
expectTypeOf<JcodeHarnessSettings>().toMatchTypeOf<{
  model?: string;
  reasoningEffort?: string;
  jcodeHome?: string;
}>();
