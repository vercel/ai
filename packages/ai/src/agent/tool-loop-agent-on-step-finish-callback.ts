import { StepResult } from '../generate-text/step-result';
import { ToolSet } from '../generate-text/tool-set';

/**
 * Callback that is set using the `onStepFinish` option.
 *
 * @param stepResult - The result of the step.
 */
export type ToolLoopAgentOnStepFinishCallback<TOOLS extends ToolSet = {}> = (
  stepResult: StepResult<TOOLS>,
) => Promise<void> | void;
