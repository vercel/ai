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
import type { GenerationContext } from './generation-context';
import type { ToolSet } from '@ai-sdk/provider-utils';

/**
 * The result of a single step in the generation process.
 */
export type StepResult<
  TOOLS extends ToolSet,
  CONTEXT extends GenerationContext<TOOLS>,
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
  readonly experimental_context: CONTEXT;

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
  CONTEXT extends GenerationContext<TOOLS>,
> implements StepResult<TOOLS, CONTEXT> {
  readonly callId: StepResult<TOOLS, CONTEXT>['callId'];
  readonly stepNumber: StepResult<TOOLS, CONTEXT>['stepNumber'];
  readonly model: StepResult<TOOLS, CONTEXT>['model'];
  readonly functionId: StepResult<TOOLS, CONTEXT>['functionId'];
  readonly metadata: StepResult<TOOLS, CONTEXT>['metadata'];
  readonly experimental_context: StepResult<
    TOOLS,
    CONTEXT
  >['experimental_context'];
  readonly content: StepResult<TOOLS, CONTEXT>['content'];
  readonly finishReason: StepResult<TOOLS, CONTEXT>['finishReason'];
  readonly rawFinishReason: StepResult<TOOLS, CONTEXT>['rawFinishReason'];
  readonly usage: StepResult<TOOLS, CONTEXT>['usage'];
  readonly warnings: StepResult<TOOLS, CONTEXT>['warnings'];
  readonly request: StepResult<TOOLS, CONTEXT>['request'];
  readonly response: StepResult<TOOLS, CONTEXT>['response'];
  readonly providerMetadata: StepResult<TOOLS, CONTEXT>['providerMetadata'];

  constructor({
    callId,
    stepNumber,
    provider,
    modelId,
    functionId,
    metadata,
    experimental_context,
    content,
    finishReason,
    rawFinishReason,
    usage,
    warnings,
    request,
    response,
    providerMetadata,
  }: {
    callId: StepResult<TOOLS, CONTEXT>['callId'];
    stepNumber: StepResult<TOOLS, CONTEXT>['stepNumber'];
    provider: StepResult<TOOLS, CONTEXT>['model']['provider'];
    modelId: StepResult<TOOLS, CONTEXT>['model']['modelId'];
    functionId: StepResult<TOOLS, CONTEXT>['functionId'];
    metadata: StepResult<TOOLS, CONTEXT>['metadata'];
    experimental_context: StepResult<TOOLS, CONTEXT>['experimental_context'];
    content: StepResult<TOOLS, CONTEXT>['content'];
    finishReason: StepResult<TOOLS, CONTEXT>['finishReason'];
    rawFinishReason: StepResult<TOOLS, CONTEXT>['rawFinishReason'];
    usage: StepResult<TOOLS, CONTEXT>['usage'];
    warnings: StepResult<TOOLS, CONTEXT>['warnings'];
    request: StepResult<TOOLS, CONTEXT>['request'];
    response: StepResult<TOOLS, CONTEXT>['response'];
    providerMetadata: StepResult<TOOLS, CONTEXT>['providerMetadata'];
  }) {
    this.callId = callId;
    this.stepNumber = stepNumber;
    this.model = { provider, modelId };
    this.functionId = functionId;
    this.metadata = metadata;
    this.experimental_context = experimental_context;
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
