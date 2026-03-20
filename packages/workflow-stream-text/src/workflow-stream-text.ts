import { LanguageModelV4 } from '@ai-sdk/provider';
import {
  createIdGenerator,
  ModelMessage,
  ProviderOptions,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import {
  convertToLanguageModelPrompt,
  doStreamTextStep,
  isStopConditionMet,
  prepareCallSettings,
  prepareToolsAndToolChoice,
  standardizePrompt,
  stepCountIs,
  toResponseMessages,
} from 'ai/internal';
import type {
  LanguageModel,
  PrepareStepFunction,
  StepResult,
  StopCondition,
  TextStreamPart,
  ToolChoice,
  ToolSet,
} from 'ai';

const generateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

export type WorkflowStreamTextOptions<TOOLS extends ToolSet> = {
  /**
   * The language model to use.
   * Must be a LanguageModelV4 instance (already resolved).
   */
  model: LanguageModelV4;

  /**
   * The tools that the model can call.
   */
  tools?: TOOLS;

  /**
   * The tool choice strategy. Default: 'auto'.
   */
  toolChoice?: ToolChoice<TOOLS>;

  /**
   * System message.
   */
  system?: string | SystemModelMessage | Array<SystemModelMessage>;

  /**
   * The messages to send to the model.
   */
  messages: ModelMessage[];

  /**
   * Maximum number of steps. Default: 1.
   */
  maxSteps?: number;

  /**
   * Condition for stopping when there are tool results.
   * When the condition is an array, any of the conditions can be met.
   *
   * @default stepCountIs(1)
   */
  stopWhen?: StopCondition<TOOLS> | StopCondition<TOOLS>[];

  /**
   * Optional function to customize settings per step.
   */
  prepareStep?: PrepareStepFunction<TOOLS>;

  /**
   * Maximum number of retries per model call. Default: 2.
   */
  maxRetries?: number;

  /**
   * An optional abort signal.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers.
   */
  headers?: Record<string, string | undefined>;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: ProviderOptions;

  /**
   * Call settings (temperature, maxOutputTokens, etc.)
   */
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stopSequences?: string[];
};

/**
 * Represents a single step yielded by the workflowStreamText generator.
 */
export type WorkflowStreamTextYieldedStep<TOOLS extends ToolSet> = {
  /**
   * The TextStreamPart stream for this step.
   * The caller should consume this stream (e.g., pipe to writable).
   */
  stream: ReadableStream<TextStreamPart<TOOLS>>;

  /**
   * Promise that resolves to the StepResult once the stream is fully consumed.
   */
  stepResult: Promise<StepResult<TOOLS>>;

  /**
   * Promise that resolves to the tool calls in this step.
   */
  toolCalls: Promise<StepResult<TOOLS>['toolCalls']>;

  /**
   * The step number (zero-based).
   */
  stepNumber: number;
};

/**
 * Result returned after the generator completes.
 */
export type WorkflowStreamTextResult<TOOLS extends ToolSet> = {
  steps: StepResult<TOOLS>[];
  messages: ModelMessage[];
};

/**
 * Orchestrates a multi-step streaming text generation loop,
 * yielding each step's stream and tool calls to the caller.
 *
 * The caller controls:
 * - Where the stream goes (pipe to writable, consume directly, etc.)
 * - How tools are executed (as durable steps, locally, etc.)
 * - When to stop (via stopWhen, maxSteps, or breaking the generator)
 *
 * Tool results are provided back to the generator by the caller
 * adding tool result messages to the conversation before the next
 * iteration. The generator handles message accumulation internally.
 *
 * @yields A step containing the stream, stepResult promise, toolCalls promise, and step number.
 */
export async function* workflowStreamText<TOOLS extends ToolSet>(
  options: WorkflowStreamTextOptions<TOOLS>,
): AsyncGenerator<
  WorkflowStreamTextYieldedStep<TOOLS>,
  WorkflowStreamTextResult<TOOLS>
> {
  const {
    model,
    tools,
    toolChoice,
    system,
    messages,
    maxSteps,
    stopWhen,
    prepareStep,
    maxRetries,
    abortSignal,
    headers,
    providerOptions,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    stopSequences,
  } = options;

  // Prepare call settings
  const callSettings = prepareCallSettings({
    maxOutputTokens,
    temperature,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    stopSequences,
  });

  // Standardize the prompt
  const initialPrompt = await standardizePrompt({
    system,
    messages,
  } as { system?: typeof system; messages: ModelMessage[] });

  // Build stop conditions
  const stopConditions: StopCondition<TOOLS>[] = [];
  if (stopWhen != null) {
    if (Array.isArray(stopWhen)) {
      stopConditions.push(...stopWhen);
    } else {
      stopConditions.push(stopWhen);
    }
  }
  if (maxSteps != null) {
    stopConditions.push(stepCountIs(maxSteps));
  }
  // Default: stop after 1 step if no conditions provided
  if (stopConditions.length === 0) {
    stopConditions.push(stepCountIs(1));
  }

  const callId = generateCallId();
  const recordedSteps: StepResult<TOOLS>[] = [];
  const responseMessages: Array<
    | import('@ai-sdk/provider-utils').AssistantModelMessage
    | import('@ai-sdk/provider-utils').ToolModelMessage
  > = [];

  let stepNumber = 0;

  while (true) {
    const stepInputMessages: ModelMessage[] = [
      ...initialPrompt.messages,
      ...responseMessages,
    ];

    // Call prepareStep if provided
    const prepareStepResult = await prepareStep?.({
      model: model as unknown as LanguageModel,
      steps: recordedSteps,
      stepNumber,
      messages: stepInputMessages,
      experimental_context: undefined,
    });

    const stepModel: LanguageModelV4 =
      (prepareStepResult?.model as unknown as LanguageModelV4 | undefined) ??
      model;

    const stepSystem = prepareStepResult?.system ?? initialPrompt.system;
    const stepMessages = prepareStepResult?.messages ?? stepInputMessages;

    // Convert messages to language model prompt
    const promptMessages = await convertToLanguageModelPrompt({
      prompt: {
        system: stepSystem,
        messages: stepMessages,
      },
      supportedUrls: await stepModel.supportedUrls,
      download: undefined,
    });

    // Prepare tools
    const { toolChoice: stepToolChoice, tools: stepTools } =
      await prepareToolsAndToolChoice({
        tools,
        toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
        activeTools: prepareStepResult?.activeTools,
      });

    const stepProviderOptions =
      prepareStepResult?.providerOptions ?? providerOptions;

    // Execute single step
    const stepResult = await doStreamTextStep({
      model: stepModel,
      tools,
      callSettings,
      maxRetries,
      languageModelTools: stepTools,
      toolChoice: stepToolChoice,
      prompt: promptMessages,
      providerOptions: stepProviderOptions,
      abortSignal,
      headers,
      system: stepSystem,
      messages: stepMessages as ModelMessage[],
      callId,
      stepNumber,
    });

    // Yield the step to the caller
    yield {
      stream: stepResult.stream,
      stepResult: stepResult.stepResult,
      toolCalls: stepResult.toolCalls,
      stepNumber,
    };

    // Wait for the step to complete (caller must consume the stream first)
    const completedStep = await stepResult.stepResult;
    recordedSteps.push(completedStep);

    // Build response messages from this step's content
    const stepResponseMessages = await toResponseMessages({
      content: completedStep.content,
      tools,
    });
    responseMessages.push(...stepResponseMessages);

    // Check if we should continue
    const hasToolCalls = completedStep.toolCalls.length > 0;
    const shouldStop = await isStopConditionMet({
      stopConditions,
      steps: recordedSteps,
    });

    if (!hasToolCalls || shouldStop) {
      break;
    }

    stepNumber++;
  }

  return {
    steps: recordedSteps,
    messages: [...initialPrompt.messages, ...responseMessages],
  };
}
