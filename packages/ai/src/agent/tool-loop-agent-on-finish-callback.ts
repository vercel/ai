import { StepResult } from '../generate-text/step-result';
import { ToolSet } from '../generate-text/tool-set';
import { LanguageModelUsage } from '../types/usage';

/**
 * Callback that is set using the `onFinish` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type ToolLoopAgentOnFinishCallback<TOOLS extends ToolSet = {}> = (
  event: StepResult<TOOLS> & {
    /**
     * Details for all steps.
     */
    readonly steps: StepResult<TOOLS>[];

    /**
     * Total usage for all steps. This is the sum of the usage of all steps.
     */
    readonly totalUsage: LanguageModelUsage;

    /**
     * Context that is passed into tool calls.
     *
     * Experimental (can break in patch releases).
     *
     * @default undefined
     */
    experimental_context?: unknown;
  },
) => PromiseLike<void> | void;
