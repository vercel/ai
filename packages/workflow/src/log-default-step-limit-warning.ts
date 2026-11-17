import { logDefaultStopConditionWarning } from 'ai/internal';

/**
 * Logs the warning for the default step limit. The step body runs once, so
 * workflow replay does not log the warning again.
 */
export async function logDefaultStepLimitWarning(options: {
  stepCount: number;
  provider: string;
  modelId: string;
}): Promise<void> {
  'use step';

  logDefaultStopConditionWarning(options);
}
