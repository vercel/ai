import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import { NoOutputGeneratedError } from '../error/no-output-generated-error';
import type { LanguageModelUsage } from '../types/usage';
import type { GenerateTextResult } from './generate-text-result';
import type { Output } from './output';
import type { InferCompleteOutput } from './output-utils';
import { convertToReasoningOutputs } from './reasoning-output';
import type { ResponseMessage } from './response-message';

export class DefaultGenerateTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> implements GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  readonly steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps'];
  readonly totalUsage: LanguageModelUsage;
  private readonly _output: InferCompleteOutput<OUTPUT> | undefined;

  constructor(options: {
    initialResponseMessages: Array<ResponseMessage>;
    steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps'];
    output: InferCompleteOutput<OUTPUT> | undefined;
    totalUsage: LanguageModelUsage;
  }) {
    this.initialResponseMessages = options.initialResponseMessages;
    this.steps = options.steps;
    this._output = options.output;
    this.totalUsage = options.totalUsage;
  }

  private readonly initialResponseMessages: Array<ResponseMessage>;

  get finalStep() {
    return this.steps.at(-1)!;
  }

  get content() {
    return this.steps.flatMap(step => step.content);
  }

  get text() {
    return this.finalStep.text;
  }

  get files() {
    return this.steps.flatMap(step => step.files);
  }

  get reasoningText() {
    return this.finalStep.reasoningText;
  }

  get reasoning() {
    return convertToReasoningOutputs(this.finalStep.reasoning);
  }

  get toolCalls() {
    return this.steps.flatMap(step => step.toolCalls);
  }

  get staticToolCalls() {
    return this.steps.flatMap(step => step.staticToolCalls);
  }

  get dynamicToolCalls() {
    return this.steps.flatMap(step => step.dynamicToolCalls);
  }

  get toolResults() {
    return this.steps.flatMap(step => step.toolResults);
  }

  get staticToolResults() {
    return this.steps.flatMap(step => step.staticToolResults);
  }

  get dynamicToolResults() {
    return this.steps.flatMap(step => step.dynamicToolResults);
  }

  get sources() {
    return this.steps.flatMap(step => step.sources);
  }

  get finishReason() {
    return this.finalStep.finishReason;
  }

  get rawFinishReason() {
    return this.finalStep.rawFinishReason;
  }

  get warnings() {
    return this.steps.flatMap(step => step.warnings ?? []);
  }

  get providerMetadata() {
    return this.finalStep.providerMetadata;
  }

  get response() {
    return this.finalStep.response;
  }

  get responseMessages() {
    return [
      ...this.initialResponseMessages,
      ...this.steps.flatMap(step => step.response.messages),
    ];
  }

  get request() {
    return this.finalStep.request;
  }

  get usage() {
    return this.totalUsage;
  }

  get output() {
    if (this._output == null) {
      throw new NoOutputGeneratedError();
    }

    return this._output;
  }
}
