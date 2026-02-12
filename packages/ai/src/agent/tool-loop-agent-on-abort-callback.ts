import { StepResult } from '../generate-text/step-result';
import { ToolSet } from '../generate-text/tool-set';

/**
 * Callback that is set using the `onAbort` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type ToolLoopAgentOnAbortCallback<TOOLS extends ToolSet = {}> = (event: {
  /**
   * Details for all previously finished steps.
   */
  readonly steps: StepResult<TOOLS>[];
}) => Promise<void> | void;
