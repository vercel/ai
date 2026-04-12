import type {
  Context,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import {
  ModelMessage,
  ProviderOptions,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { LanguageModel, ToolChoice } from '../types/language-model';
import { StepResult } from './step-result';

/**
 * Function that you can use to provide different settings for a step.
 *
 * @param options - The options for the step.
 * @param options.steps - The steps that have been executed so far.
 * @param options.stepNumber - The number of the step that is being executed.
 * @param options.model - The model that is being used.
 * @param options.messages - The messages that will be sent to the model for the current step.
 * @param options.context - The user-defined runtime context.
 *
 * @returns An object that contains the settings for the step.
 * If you return undefined (or for undefined settings), the settings from the outer level will be used.
 */
export type PrepareStepFunction<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
> = (options: {
  /**
   * The steps that have been executed so far.
   */
  steps: Array<StepResult<NoInfer<TOOLS>, NoInfer<USER_CONTEXT>>>;

  /**
   * The number of the step that is being executed.
   */
  stepNumber: number;

  /**
   * The model instance that is being used for this step.
   */
  model: LanguageModel;

  /**
   * The messages that will be sent to the model for the current step.
   */
  messages: Array<ModelMessage>;

  /**
   * User-defined runtime context.
   *
   * To modify the context, return a new context in the result.
   */
  context: InferToolSetContext<TOOLS> & USER_CONTEXT;
}) =>
  | PromiseLike<PrepareStepResult<TOOLS, USER_CONTEXT>>
  | PrepareStepResult<TOOLS, USER_CONTEXT>;

/**
 * The result type returned by a {@link PrepareStepFunction},
 * allowing per-step overrides of model, tools, or messages.
 */
export type PrepareStepResult<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
> =
  | {
      /**
       * Optionally override which LanguageModel instance is used for this step.
       */
      model?: LanguageModel;

      /**
       * Optionally set which tool the model must call, or provide tool call configuration
       * for this step.
       */
      toolChoice?: ToolChoice<NoInfer<TOOLS>>;

      /**
       * If provided, only these tools are enabled/available for this step.
       */
      activeTools?: Array<keyof NoInfer<TOOLS>>;

      /**
       * Optionally override the system message(s) sent to the model for this step.
       */
      system?: string | SystemModelMessage | Array<SystemModelMessage>;

      /**
       * Optionally override the full set of messages sent to the model
       * for this step.
       */
      messages?: Array<ModelMessage>;

      /**
       * User-defined runtime context that is passed into tool execution.
       *
       * Changing the context will affect the context in this step
       * and all subsequent steps.
       */
      context?: InferToolSetContext<TOOLS> & USER_CONTEXT;

      /**
       * Additional provider-specific options for this step.
       *
       * Can be used to pass provider-specific configuration such as
       * container IDs for Anthropic's code execution.
       */
      providerOptions?: ProviderOptions;
    }
  | undefined;
