import { LanguageModel, ToolChoice } from '../types/language-model';
import { CoreMessage } from '../prompt/message';
import { StepResult } from './step-result';
import { ToolSet } from './tool-set';

/**
 * Function that prepares the settings for a step in multi-step text generation.
 */
export type PrepareStepFunction<TOOLS extends ToolSet> = (options: {
  /**
   * The model that is being used.
   */
  model: LanguageModel;

  /**
   * The steps that have been executed so far.
   */
  steps: StepResult<TOOLS>[];

  /**
   * The number of the step that is being executed (0-indexed).
   */
  stepNumber: number;

  /**
   * The messages that will be sent to the model for this step.
   */
  messages: CoreMessage[];
}) => Promise<
  | {
      /**
       * Override the system prompt for this step.
       */
      system?: string;

      /**
       * Override the messages for this step.
       */
      messages?: CoreMessage[];

      /**
       * Override the model for this step.
       */
      model?: LanguageModel;

      /**
       * Override the tool choice for this step.
       */
      toolChoice?: ToolChoice<TOOLS>;

      /**
       * Override the active tools for this step.
       */
      experimental_activeTools?: Array<keyof TOOLS>;
    }
  | undefined
>;
