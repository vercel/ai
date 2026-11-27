import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import type {
  ContentPart,
  FinishReason,
  GenerateTextResult,
  LanguageModelUsage,
  OutputInterface as Output,
  ReasoningFileOutput,
  ReasoningOutput,
  StepResult,
} from 'ai';

/**
 * Minimal `GenerateTextResult` over one finished turn of a HarnessV2 session,
 * derived from the turn's recorded steps.
 *
 * Collections (`content`, tool calls and results, files, sources, warnings)
 * span all steps; `text`, reasoning, usage and response data come from the
 * last step. `responseMessages` and structured `output` are not implemented
 * yet.
 */
export class HarnessGenerateTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> implements GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  /**
   * Recorded steps of the turn, at least one.
   */
  readonly steps: Array<StepResult<TOOLS, RUNTIME_CONTEXT>>;

  /**
   * Aggregate usage of the turn.
   */
  readonly totalUsage: LanguageModelUsage;

  /**
   * Reason the turn finished with.
   */
  readonly finishReason: FinishReason;

  /**
   * Raw reason the turn finished with, if reported.
   */
  readonly rawFinishReason: string | undefined;

  /**
   * Creates the result from the turn's steps and finish data.
   */
  constructor(options: {
    /**
     * Recorded steps of the turn, at least one.
     */
    steps: Array<StepResult<TOOLS, RUNTIME_CONTEXT>>;

    /**
     * Aggregate usage of the turn.
     */
    totalUsage: LanguageModelUsage;

    /**
     * Reason the turn finished with.
     */
    finishReason: FinishReason;

    /**
     * Raw reason the turn finished with, if reported.
     */
    rawFinishReason?: string;
  }) {
    this.steps = options.steps;
    this.totalUsage = options.totalUsage;
    this.finishReason = options.finishReason;
    this.rawFinishReason = options.rawFinishReason;
  }

  /**
   * Last recorded step of the turn.
   */
  get finalStep() {
    return this.steps.at(-1)!;
  }

  /**
   * Content of all recorded steps.
   */
  get content() {
    return this.steps.flatMap(step => step.content);
  }

  /**
   * Text of the last recorded step.
   */
  get text() {
    return this.finalStep.text;
  }

  /**
   * Reasoning of the last recorded step.
   */
  get reasoning() {
    return getReasoningOutput({ content: this.finalStep.content });
  }

  /**
   * Reasoning text of the last recorded step.
   */
  get reasoningText() {
    return this.finalStep.reasoningText;
  }

  /**
   * Files generated across all recorded steps.
   */
  get files() {
    return this.steps.flatMap(step => step.files);
  }

  /**
   * Sources used across all recorded steps.
   */
  get sources() {
    return this.steps.flatMap(step => step.sources);
  }

  /**
   * Tool calls across all recorded steps.
   */
  get toolCalls() {
    return this.steps.flatMap(step => step.toolCalls);
  }

  /**
   * Typed tool calls across all recorded steps.
   */
  get staticToolCalls() {
    return this.steps.flatMap(step => step.staticToolCalls);
  }

  /**
   * Dynamic tool calls across all recorded steps.
   */
  get dynamicToolCalls() {
    return this.steps.flatMap(step => step.dynamicToolCalls);
  }

  /**
   * Tool results across all recorded steps.
   */
  get toolResults() {
    return this.steps.flatMap(step => step.toolResults);
  }

  /**
   * Typed tool results across all recorded steps.
   */
  get staticToolResults() {
    return this.steps.flatMap(step => step.staticToolResults);
  }

  /**
   * Dynamic tool results across all recorded steps.
   */
  get dynamicToolResults() {
    return this.steps.flatMap(step => step.dynamicToolResults);
  }

  /**
   * Usage of the last recorded step.
   */
  get usage() {
    return this.finalStep.usage;
  }

  /**
   * Warnings of the recorded steps.
   */
  get warnings() {
    const warnings = this.steps.flatMap(step => step.warnings ?? []);
    return warnings.length > 0 ? warnings : undefined;
  }

  /**
   * Request data of the last recorded step.
   */
  get request() {
    return this.finalStep.request;
  }

  /**
   * Response data of the last recorded step.
   */
  get response() {
    return this.finalStep.response;
  }

  /**
   * Provider metadata of the last recorded step.
   */
  get providerMetadata() {
    return this.finalStep.providerMetadata;
  }

  /**
   * Not implemented yet.
   */
  get responseMessages(): never {
    throw new Error('HarnessAgent: `responseMessages` is not implemented yet.');
  }

  /**
   * Not implemented yet.
   */
  get output(): never {
    throw new Error('HarnessAgent: `output` is not implemented yet.');
  }
}

/**
 * Returns the reasoning and reasoning file parts of a step's content.
 */
export function getReasoningOutput<TOOLS extends ToolSet>(options: {
  /**
   * Content of the step.
   */
  content: Array<ContentPart<TOOLS>>;
}): Array<ReasoningOutput | ReasoningFileOutput> {
  return options.content.filter(
    (part): part is ReasoningOutput | ReasoningFileOutput =>
      part.type === 'reasoning' || part.type === 'reasoning-file',
  );
}
