import { LanguageModelUsage } from '../types/usage';
import { StepResult } from './step-result';
import { ToolSet } from './tool-set';

/**
 * Event that is passed to the `onFinish` callback.
 */
export type TextOnFinishEvent<TOOLS extends ToolSet> = StepResult<TOOLS> & {
  /**
   * Details for all steps.
   */
  readonly steps: StepResult<TOOLS>[];

  /**
   * Total usage for all steps. This is the sum of the usage of all steps.
   */
  readonly totalUsage: LanguageModelUsage;

  /**
   * Context that is passed into tool execution.
   *
   * Experimental (can break in patch releases).
   *
   * @default undefined
   */
  experimental_context: unknown;
};

/**
 * Callback that is set using the `onFinish` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type TextOnFinishCallback<TOOLS extends ToolSet> = (
  event: TextOnFinishEvent<TOOLS>,
) => PromiseLike<void> | void;
