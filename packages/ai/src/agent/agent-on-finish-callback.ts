import { StepResult } from '../generate-text/step-result';
import { ToolSet } from '../generate-text/tool-set';
import { LanguageModelUsage } from '../types/usage';

/**
Callback that is set using the `onFinish` option.

@param event - The event that is passed to the callback.
 */
export type AgentOnFinishCallback<TOOLS extends ToolSet> = (
  event: StepResult<TOOLS> & {
    /**
Details for all steps.
   */
    readonly steps: StepResult<TOOLS>[];

    /**
Total usage for all steps. This is the sum of the usage of all steps.
     */
    readonly totalUsage: LanguageModelUsage;
  },
) => PromiseLike<void> | void;
