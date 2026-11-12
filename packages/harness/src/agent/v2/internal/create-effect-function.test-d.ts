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

test('redeclares the adapter effect signature without changing it', () => {
  expectTypeOf<HarnessAgentEffectFunction>().toEqualTypeOf<
    HarnessV2DriveContext['effect']
  >();
  expectTypeOf<HarnessAgentEffectFunction>().toEqualTypeOf<HarnessV2EffectFunction>();
  expectTypeOf<HarnessAgentEffectOptions>().toEqualTypeOf<HarnessV2EffectOptions>();
});
