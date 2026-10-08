import { logWarnings } from '../logger/log-warnings';
import type { StopCondition } from './stop-condition';

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

    return true;
  };
}
