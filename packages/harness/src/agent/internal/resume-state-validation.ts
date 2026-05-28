import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { HarnessError } from '../../errors/harness-error';
import type { HarnessV1, HarnessV1ResumeState } from '../../v1';

/**
 * Validate a `HarnessV1ResumeState` against the harness's contract:
 *  - `specificationVersion` must be `'harness-v1'`.
 *  - `harnessId` must match the harness producing/consuming the payload.
 *  - When the harness declares a `resumeStateSchema`, `data` is parsed
 *    against it.
 *
 * Returns the payload with `data` replaced by the parsed value when a
 * schema is present, so callers downstream see a canonical shape.
 */
export async function validateResumeStateData(input: {
  harness: HarnessV1;
  state: HarnessV1ResumeState;
}): Promise<HarnessV1ResumeState> {
  const { harness, state } = input;
  if (state.specificationVersion !== 'harness-v1') {
    throw new HarnessError({
      message: `Resume state has unexpected specificationVersion '${state.specificationVersion}'; expected 'harness-v1'.`,
    });
  }
  if (state.harnessId !== harness.harnessId) {
    throw new HarnessError({
      message: `Resume state was produced by harness '${state.harnessId}' but this agent uses '${harness.harnessId}'.`,
    });
  }
  if (harness.resumeStateSchema == null) {
    return state;
  }
  const result = await safeValidateTypes({
    value: state.data,
    schema: harness.resumeStateSchema,
  });
  if (!result.success) {
    throw new HarnessError({
      message: `Resume state failed schema validation for harness '${harness.harnessId}': ${result.error.message}`,
      cause: result.error,
    });
  }
  return {
    harnessId: state.harnessId,
    specificationVersion: state.specificationVersion,
    data: result.value as HarnessV1ResumeState['data'],
  };
}
