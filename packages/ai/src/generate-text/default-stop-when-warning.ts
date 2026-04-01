import { logWarnings } from '../logger/log-warnings';
import {
  getStopConditionStepCount,
  isStopConditionMet,
  StopCondition,
} from './stop-condition';
import { StepResult } from './step-result';
import { ToolSet } from './tool-set';

export async function logDefaultStopWhenWarningIfNeeded<
  TOOLS extends ToolSet,
>(options: {
  provider: string;
  model: string;
  usedDefaultStopWhen: boolean;
  defaultStopStepCount: number;
  stopConditions: Array<StopCondition<TOOLS>>;
  steps: Array<StepResult<TOOLS>>;
  toolLoopCouldContinue: boolean;
}): Promise<void> {
  const {
    provider,
    model,
    usedDefaultStopWhen,
    defaultStopStepCount,
    stopConditions,
    steps,
    toolLoopCouldContinue,
  } = options;

  if (!usedDefaultStopWhen || !toolLoopCouldContinue) {
    return;
  }

  if (
    !(await isStopConditionMet({
      stopConditions,
      steps,
    }))
  ) {
    return;
  }

  if (stopConditions.length !== 1) {
    return;
  }

  if (getStopConditionStepCount(stopConditions[0]) !== defaultStopStepCount) {
    return;
  }

  if (steps.length !== defaultStopStepCount) {
    return;
  }

  logWarnings({
    provider,
    model,
    warnings: [
      {
        type: 'other',
        message: `The tool loop stopped before the next model step because the default stopWhen condition matched (isStepCount(${defaultStopStepCount})). To run more tool rounds, pass a different stopWhen (for example isStepCount with a higher limit) or a custom stop condition.`,
      },
    ],
  });
}
