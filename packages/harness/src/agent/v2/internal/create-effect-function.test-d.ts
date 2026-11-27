import { expectTypeOf, test } from 'vitest';
import type { HarnessV2EffectFunction } from '../../../index';
import type {
  HarnessV2DriveContext,
  HarnessV2EffectOptions,
} from '../../../v2/harness-v2-drive-context';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentEffectOptions,
} from './create-effect-function';
import type { HarnessAgentStreamPart } from './create-stream-writer';

test('exposes the agent effect function as the adapter effect function', () => {
  expectTypeOf<HarnessAgentEffectFunction>().toMatchTypeOf<
    HarnessV2DriveContext['effect']
  >();
  expectTypeOf<HarnessAgentEffectFunction>().toMatchTypeOf<HarnessV2EffectFunction>();
  expectTypeOf<Omit<HarnessAgentEffectOptions, 'fn'>>().toEqualTypeOf<
    Omit<HarnessV2EffectOptions, 'fn'>
  >();
});

test('lets engine effect callbacks emit agent stream parts', () => {
  expectTypeOf<
    Parameters<Parameters<HarnessAgentEffectOptions['fn']>[0]['emit']>[0]
  >().toEqualTypeOf<HarnessAgentStreamPart>();
});
