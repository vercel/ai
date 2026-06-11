import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { HarnessError } from '../../errors/harness-error';
import type { HarnessV1, HarnessV1LifecycleState } from '../../v1';

/**
 * Validate a lifecycle state against the harness's contract:
 *  - `type` must match the lifecycle method that will consume it.
 *  - `specificationVersion` must be `'harness-v1'`.
 *  - `harnessId` must match the harness producing/consuming the payload.
 *  - When the harness declares a `lifecycleStateSchema`, `data` is parsed
 *    against it.
 *
 * Returns the payload with `data` replaced by the parsed value when a
 * schema is present, so callers downstream see a canonical shape.
 */
export async function validateLifecycleStateData<
  STATE extends HarnessV1LifecycleState,
>(input: {
  harness: HarnessV1;
  state: STATE;
  expectedType: STATE['type'];
}): Promise<STATE> {
  const { harness, state } = input;
  if (state.type !== input.expectedType) {
    throw new HarnessError({
      message: `Lifecycle state has unexpected type '${state.type}'; expected '${input.expectedType}'.`,
    });
  }
  if (state.specificationVersion !== 'harness-v1') {
    throw new HarnessError({
      message: `Lifecycle state has unexpected specificationVersion '${state.specificationVersion}'; expected 'harness-v1'.`,
    });
  }
  if (state.harnessId !== harness.harnessId) {
    throw new HarnessError({
      message: `Lifecycle state was produced by harness '${state.harnessId}' but this agent uses '${harness.harnessId}'.`,
    });
  }
  if (harness.lifecycleStateSchema == null) {
    return state;
  }
  const result = await safeValidateTypes({
    value: state.data,
    schema: harness.lifecycleStateSchema,
  });
  if (!result.success) {
    throw new HarnessError({
      message: `Lifecycle state failed schema validation for harness '${harness.harnessId}': ${result.error.message}`,
      cause: result.error,
    });
  }
  return {
    type: state.type,
    harnessId: state.harnessId,
    specificationVersion: state.specificationVersion,
    data: result.value as STATE['data'],
    ...(state.pendingToolApprovals !== undefined
      ? { pendingToolApprovals: state.pendingToolApprovals }
      : {}),
  } as STATE;
}
