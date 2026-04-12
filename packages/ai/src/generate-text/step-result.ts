import type {
  Context,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { ReasoningFilePart, ReasoningPart } from '@ai-sdk/provider-utils';
import {
  CallWarning,
  FinishReason,
  LanguageModelRequestMetadata,
  LanguageModelResponseMetadata,
  ProviderMetadata,
} from '../types';
import { Source } from '../types/language-model';
import { LanguageModelUsage } from '../types/usage';
import { ContentPart } from './content-part';
import { GeneratedFile } from './generated-file';
import { asReasoningText } from './reasoning';
import {
  ReasoningFileOutput,
  ReasoningOutput,
  convertFromReasoningOutputs,
} from './reasoning-output';
import { ResponseMessage } from './response-message';
import { DynamicToolCall, StaticToolCall, TypedToolCall } from './tool-call';
import {
  DynamicToolResult,
  StaticToolResult,
  TypedToolResult,
} from './tool-result';

/**
 * The result of a single step in the generation process.
 */
export type StepResult<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
> = {
  /**
   * Unique identifier for the generation call this step belongs to.
   */
  readonly callId: string;

  /**
   * Zero-based index of this step.
   */
  readonly stepNumber: number;

  /**
   * Information about the model that produced this step.
   */
  readonly model: {
    /** The provider of the model. */
    readonly provider: string;
    /** The ID of the model. */
    readonly modelId: string;
  };

  /**
   * Identifier from telemetry settings for grouping related operations.
   */
  readonly functionId: string | undefined;

  /**
   * Additional metadata from telemetry settings.
   */
  readonly metadata: Record<string, unknown> | undefined;

  /**
   * User-defined context object flowing through the generation.
   *
   * Experimental (can break in patch releases).
   */
  readonly context: InferToolSetContext<TOOLS> & USER_CONTEXT;

  /**
   * The content that was generated in the last step.
   */
  readonly content: Array<ContentPart<TOOLS>>;

  /**
   * The generated text.
   */
  readonly text: string;

  /**
   * The reasoning that was generated during the generation.
   */
  readonly reasoning: Array<ReasoningPart | ReasoningFilePart>;

  /**
   * The reasoning text that was generated during the generation.
   */
  readonly reasoningText: string | undefined;

  /**
   * The files that were generated during the generation.
   */
  readonly files: Array<GeneratedFile>;

  /**
   * The sources that were used to generate the text.
   */
  readonly sources: Array<Source>;

  /**
   * The tool calls that were made during the generation.
   */
  readonly toolCalls: Array<TypedToolCall<TOOLS>>;

  /**
   * The static tool calls that were made in the last step.
   */
  readonly staticToolCalls: Array<StaticToolCall<TOOLS>>;

  /**
   * The dynamic tool calls that were made in the last step.
   */
  readonly dynamicToolCalls: Array<DynamicToolCall>;

  /**
   * The results of the tool calls.
   */
  readonly toolResults: Array<TypedToolResult<TOOLS>>;

  /**
   * The static tool results that were made in the last step.
   */
  readonly staticToolResults: Array<StaticToolResult<TOOLS>>;

  /**
   * The dynamic tool results that were made in the last step.
   */
  readonly dynamicToolResults: Array<DynamicToolResult>;

  /**
   * The unified reason why the generation finished.
   */
  readonly finishReason: FinishReason;

  /**
   * The raw reason why the generation finished (from the provider).
   */
  readonly rawFinishReason: string | undefined;

  /**
   * The token usage of the generated text.
   */
  readonly usage: LanguageModelUsage;

  /**
   * Warnings from the model provider (e.g. unsupported settings).
   */
  readonly warnings: CallWarning[] | undefined;

  /**
   * Additional request information.
   */
  readonly request: LanguageModelRequestMetadata;

  /**
   * Additional response information.
   */
  readonly response: LanguageModelResponseMetadata & {
    /**
     * The response messages that were generated during the call.
     * Response messages can be either assistant messages or tool messages.
     * They contain a generated id.
     */
    readonly messages: Array<ResponseMessage>;

    /**
     * Response body (available only for providers that use HTTP requests).
     */
    body?: unknown;
  };

  /**
   * Additional provider-specific metadata. They are passed through
   * from the provider to the AI SDK and enable provider-specific
   * results that can be fully encapsulated in the provider.
   */
  readonly providerMetadata: ProviderMetadata | undefined;
};

export class DefaultStepResult<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
> implements StepResult<TOOLS, USER_CONTEXT> {
  readonly callId: StepResult<TOOLS, USER_CONTEXT>['callId'];
  readonly stepNumber: StepResult<TOOLS, USER_CONTEXT>['stepNumber'];
  readonly model: StepResult<TOOLS, USER_CONTEXT>['model'];
  readonly functionId: StepResult<TOOLS, USER_CONTEXT>['functionId'];
  readonly metadata: StepResult<TOOLS, USER_CONTEXT>['metadata'];
  readonly context: StepResult<TOOLS, USER_CONTEXT>['context'];
  readonly content: StepResult<TOOLS, USER_CONTEXT>['content'];
  readonly finishReason: StepResult<TOOLS, USER_CONTEXT>['finishReason'];
  readonly rawFinishReason: StepResult<TOOLS, USER_CONTEXT>['rawFinishReason'];
  readonly usage: StepResult<TOOLS, USER_CONTEXT>['usage'];
  readonly warnings: StepResult<TOOLS, USER_CONTEXT>['warnings'];
  readonly request: StepResult<TOOLS, USER_CONTEXT>['request'];
  readonly response: StepResult<TOOLS, USER_CONTEXT>['response'];
  readonly providerMetadata: StepResult<
    TOOLS,
    USER_CONTEXT
  >['providerMetadata'];

  constructor({
    callId,
    stepNumber,
    provider,
    modelId,
    functionId,
    metadata,
    context,
    content,
    finishReason,
    rawFinishReason,
    usage,
    warnings,
    request,
    response,
    providerMetadata,
  }: {
    callId: StepResult<TOOLS, USER_CONTEXT>['callId'];
    stepNumber: StepResult<TOOLS, USER_CONTEXT>['stepNumber'];
    provider: StepResult<TOOLS, USER_CONTEXT>['model']['provider'];
    modelId: StepResult<TOOLS, USER_CONTEXT>['model']['modelId'];
    functionId: StepResult<TOOLS, USER_CONTEXT>['functionId'];
    metadata: StepResult<TOOLS, USER_CONTEXT>['metadata'];
    context: StepResult<TOOLS, USER_CONTEXT>['context'];
    content: StepResult<TOOLS, USER_CONTEXT>['content'];
    finishReason: StepResult<TOOLS, USER_CONTEXT>['finishReason'];
    rawFinishReason: StepResult<TOOLS, USER_CONTEXT>['rawFinishReason'];
    usage: StepResult<TOOLS, USER_CONTEXT>['usage'];
    warnings: StepResult<TOOLS, USER_CONTEXT>['warnings'];
    request: StepResult<TOOLS, USER_CONTEXT>['request'];
    response: StepResult<TOOLS, USER_CONTEXT>['response'];
    providerMetadata: StepResult<TOOLS, USER_CONTEXT>['providerMetadata'];
  }) {
    this.callId = callId;
    this.stepNumber = stepNumber;
    this.model = { provider, modelId };
    this.functionId = functionId;
    this.metadata = metadata;
    this.context = context;
    this.content = content;
    this.finishReason = finishReason;
    this.rawFinishReason = rawFinishReason;
    this.usage = usage;
    this.warnings = warnings;
    this.request = request;
    this.response = response;
    this.providerMetadata = providerMetadata;
  }

  get text() {
    return this.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('');
  }

  get reasoning(): Array<ReasoningPart | ReasoningFilePart> {
    return convertFromReasoningOutputs(
      this.content.filter(
        (part): part is ReasoningOutput | ReasoningFileOutput =>
          part.type === 'reasoning' || part.type === 'reasoning-file',
      ),
    );
  }

  get reasoningText() {
    return asReasoningText(this.reasoning);
  }

  get files() {
    return this.content
      .filter(part => part.type === 'file')
      .map(part => part.file);
  }

  get sources() {
    return this.content.filter(part => part.type === 'source');
  }

  get toolCalls() {
    return this.content.filter(part => part.type === 'tool-call');
  }

  get staticToolCalls() {
    return this.toolCalls.filter(
      (toolCall): toolCall is StaticToolCall<TOOLS> =>
        toolCall.dynamic !== true,
    );
  }

  get dynamicToolCalls() {
    return this.toolCalls.filter(
      (toolCall): toolCall is DynamicToolCall => toolCall.dynamic === true,
    );
  }

  get toolResults() {
    return this.content.filter(part => part.type === 'tool-result');
  }

  get staticToolResults() {
    return this.toolResults.filter(
      (toolResult): toolResult is StaticToolResult<TOOLS> =>
        toolResult.dynamic !== true,
    );
  }

  get dynamicToolResults() {
    return this.toolResults.filter(
      (toolResult): toolResult is DynamicToolResult =>
        toolResult.dynamic === true,
    );
  }
}
