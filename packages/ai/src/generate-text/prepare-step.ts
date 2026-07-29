<<<<<<< HEAD
import type { ModelMessage, Tool } from '@ai-sdk/provider-utils';
=======
import type {
  Context,
  Experimental_SandboxSession as SandboxSession,
  InferToolSetContext,
  ModelMessage,
  ProviderOptions,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { Instructions } from '../prompt';
import type { LanguageModelCallOptions } from '../prompt/language-model-call-options';
>>>>>>> 60f97f6738 (feat: support per-step model call setting overrides in prepareStep (#18105))
import type { LanguageModel, ToolChoice } from '../types/language-model';
import type { StepResult } from './step-result';

/**
Function that you can use to provide different settings for a step.

@param options - The options for the step.
@param options.steps - The steps that have been executed so far.
@param options.stepNumber - The number of the step that is being executed.
@param options.model - The model that is being used.

@returns An object that contains the settings for the step.
If you return undefined (or for undefined settings), the settings from the outer level will be used.
    */
export type PrepareStepFunction<
  TOOLS extends Record<string, Tool> = Record<string, Tool>,
> = (options: {
  steps: Array<StepResult<NoInfer<TOOLS>>>;
  stepNumber: number;
  model: LanguageModel;
  messages: Array<ModelMessage>;
}) => PromiseLike<PrepareStepResult<TOOLS>> | PrepareStepResult<TOOLS>;

<<<<<<< HEAD
=======
  /**
   * The initial messages that were passed into generateText or streamText.
   */
  initialMessages: Array<ModelMessage>;

  /**
   * The response messages that have been accumulated from all previous steps.
   */
  responseMessages: Array<ResponseMessage>;

  /**
   * Tool context.
   */
  toolsContext: InferToolSetContext<TOOLS>;

  /**
   * User-defined runtime context.
   */
  runtimeContext: RUNTIME_CONTEXT;

  /**
   * The sandbox environment that the step is operating in.
   */
  experimental_sandbox?: SandboxSession;
}) =>
  | PromiseLike<PrepareStepResult<TOOLS, RUNTIME_CONTEXT>>
  | PrepareStepResult<TOOLS, RUNTIME_CONTEXT>;

/**
 * The result type returned by a {@link PrepareStepFunction},
 * allowing per-step overrides of model call settings, model, tools,
 * instructions, or messages.
 *
 * Model call setting overrides apply only to the current step. Undefined
 * settings fall back to the outer call settings.
 */
>>>>>>> 60f97f6738 (feat: support per-step model call setting overrides in prepareStep (#18105))
export type PrepareStepResult<
  TOOLS extends Record<string, Tool> = Record<string, Tool>,
> =
<<<<<<< HEAD
  | {
=======
  | ({
      /**
       * Optionally override which LanguageModel instance is used for this step.
       */
>>>>>>> 60f97f6738 (feat: support per-step model call setting overrides in prepareStep (#18105))
      model?: LanguageModel;
      toolChoice?: ToolChoice<NoInfer<TOOLS>>;
      activeTools?: Array<keyof NoInfer<TOOLS>>;
      system?: string;
      messages?: Array<ModelMessage>;
<<<<<<< HEAD
    }
=======

      /**
       * Tool context.
       *
       * Changing the toolsContext will affect the toolsContext in this step
       * and all subsequent steps.
       *
       * The toolsContext is passed into tool execution.
       */
      toolsContext?: InferToolSetContext<TOOLS>;

      /**
       * Runtime context.
       *
       * Changing the runtimeContext will affect the runtimeContext in this step
       * and all subsequent steps.
       */
      runtimeContext?: RUNTIME_CONTEXT;

      /**
       * The sandbox environment that the step is operating in.
       *
       * Changing the sandbox will affect tool execution in this step only.
       */
      experimental_sandbox?: SandboxSession;

      /**
       * Additional provider-specific options for this step.
       *
       * Can be used to pass provider-specific configuration such as
       * container IDs for Anthropic's code execution.
       */
      providerOptions?: ProviderOptions;
    } & LanguageModelCallOptions)
>>>>>>> 60f97f6738 (feat: support per-step model call setting overrides in prepareStep (#18105))
  | undefined;
