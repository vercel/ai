import { expectTypeOf, test } from 'vitest';
import type { HarnessV2DriveContext } from '../../../v2/harness-v2-drive-context';
import type {
  HarnessAgentFinishStepFunction,
  HarnessAgentFinishTurnFunction,
} from './create-finish-functions';

test('redeclares the adapter finish signatures without changing them', () => {
  expectTypeOf<HarnessAgentFinishStepFunction>().toEqualTypeOf<
    HarnessV2DriveContext['finishStep']
  >();
  expectTypeOf<HarnessAgentFinishTurnFunction>().toEqualTypeOf<
    HarnessV2DriveContext['finishTurn']
  >();
});
