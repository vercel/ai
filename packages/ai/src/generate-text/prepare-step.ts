import type { ModelMessage, Tool } from '@ai-sdk/provider-utils';
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

export type PrepareStepResult<
  TOOLS extends Record<string, Tool> = Record<string, Tool>,
> =
  | {
      model?: LanguageModel;
      toolChoice?: ToolChoice<NoInfer<TOOLS>>;
      activeTools?: Array<keyof NoInfer<TOOLS>>;
      system?: string;
      messages?: Array<ModelMessage>;
    }
  | undefined;

export function resolveStepToolChoice<
  TOOLS extends Record<string, Tool> = Record<string, Tool>,
>({
  toolChoice,
  prepareStepToolChoice,
  steps,
  hasOutput,
}: {
  toolChoice: ToolChoice<TOOLS> | undefined;
  prepareStepToolChoice: ToolChoice<TOOLS> | undefined;
  steps: Array<StepResult<TOOLS>>;
  hasOutput: boolean;
}): ToolChoice<TOOLS> | undefined {
  if (prepareStepToolChoice != null) {
    return prepareStepToolChoice;
  }

  if (
    !hasOutput ||
    toolChoice == null ||
    typeof toolChoice === 'string' ||
    !steps.some(step =>
      step.content.some(
        part =>
          (part.type === 'tool-result' || part.type === 'tool-error') &&
          part.toolName === toolChoice.toolName,
      ),
    )
  ) {
    return toolChoice;
  }

  return 'none';
}
