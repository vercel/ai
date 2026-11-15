import { logWarnings } from '../logger/log-warnings';
import type { StopCondition } from '../generate-text/stop-condition';

/**
 * Logs the warning for the default stopWhen condition.
 */
export function logDefaultStopConditionWarning({
  stepCount,
  provider,
  modelId,
}: {
  stepCount: number;
  provider: string;
  modelId: string;
}): void {
  logWarnings({
    provider,
    model: modelId,
    warnings: [
      {
        type: 'other',
        message:
          `The tool loop stopped because it reached the default stopWhen condition, isStepCount(${stepCount}). ` +
          'To allow more steps, set stopWhen to isStepCount(...) with a higher limit or provide a custom stop condition. ' +
          'Learn more: https://ai-sdk.dev/docs/agents/loop-control',
      },
    ],
  });
}

/**
 * Stop conditions are only evaluated when the tool loop can otherwise continue,
 * so logging here avoids warning when a call finishes naturally at the limit.
 */
export function createDefaultStopCondition(
  stepCount: number,
): StopCondition<any, any> {
  return ({ steps }) => {
    if (steps.length !== stepCount) {
      return false;
    }

    const { provider, modelId } = steps[steps.length - 1].model;
    logDefaultStopConditionWarning({ stepCount, provider, modelId });

    return true;
  };
}
