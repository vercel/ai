import type {
  Context,
  InferToolSetContext,
  ReasoningFilePart,
  ReasoningPart,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  CallWarning,
  FinishReason,
  LanguageModelRequestMetadata,
  LanguageModelResponseMetadata,
  ProviderMetadata,
} from '../types';
import type { Source } from '../types/language-model';
import type { LanguageModelUsage } from '../types/usage';
import type { ContentPart } from './content-part';
import type { GeneratedFile } from './generated-file';
import { asReasoningText } from './reasoning';
import {
  convertFromReasoningOutputs,
  type ReasoningFileOutput,
  type ReasoningOutput,
} from './reasoning-output';
import type { ResponseMessage } from './response-message';
import type {
  DynamicToolCall,
  StaticToolCall,
  TypedToolCall,
} from './tool-call';
import type {
  DynamicToolResult,
  StaticToolResult,
  TypedToolResult,
} from './tool-result';

/**
 * The result of a single step in the generation process.
 */
export type StepResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
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
   * Tool context.
   */
  readonly toolsContext: InferToolSetContext<TOOLS>;

  /**
   * Runtime context.
   */
  readonly runtimeContext: RUNTIME_CONTEXT;

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
  RUNTIME_CONTEXT extends Context = Context,
> implements StepResult<TOOLS, RUNTIME_CONTEXT> {
  readonly callId: StepResult<TOOLS, RUNTIME_CONTEXT>['callId'];
  readonly stepNumber: StepResult<TOOLS, RUNTIME_CONTEXT>['stepNumber'];
  readonly model: StepResult<TOOLS, RUNTIME_CONTEXT>['model'];
  readonly toolsContext: StepResult<TOOLS, RUNTIME_CONTEXT>['toolsContext'];
  readonly runtimeContext: StepResult<TOOLS, RUNTIME_CONTEXT>['runtimeContext'];
  readonly content: StepResult<TOOLS, RUNTIME_CONTEXT>['content'];
  readonly finishReason: StepResult<TOOLS, RUNTIME_CONTEXT>['finishReason'];
  readonly rawFinishReason: StepResult<
    TOOLS,
    RUNTIME_CONTEXT
  >['rawFinishReason'];
  readonly usage: StepResult<TOOLS, RUNTIME_CONTEXT>['usage'];
  readonly warnings: StepResult<TOOLS, RUNTIME_CONTEXT>['warnings'];
  readonly request: StepResult<TOOLS, RUNTIME_CONTEXT>['request'];
  readonly response: StepResult<TOOLS, RUNTIME_CONTEXT>['response'];
  readonly providerMetadata: StepResult<
    TOOLS,
    RUNTIME_CONTEXT
  >['providerMetadata'];

  constructor({
    callId,
    stepNumber,
    provider,
    modelId,
    runtimeContext,
    toolsContext,
    content,
    finishReason,
    rawFinishReason,
    usage,
    warnings,
    request,
    response,
    providerMetadata,
  }: {
    callId: StepResult<TOOLS, RUNTIME_CONTEXT>['callId'];
    stepNumber: StepResult<TOOLS, RUNTIME_CONTEXT>['stepNumber'];
    provider: StepResult<TOOLS, RUNTIME_CONTEXT>['model']['provider'];
    modelId: StepResult<TOOLS, RUNTIME_CONTEXT>['model']['modelId'];
    runtimeContext: StepResult<TOOLS, RUNTIME_CONTEXT>['runtimeContext'];
    toolsContext: StepResult<TOOLS, RUNTIME_CONTEXT>['toolsContext'];
    content: StepResult<TOOLS, RUNTIME_CONTEXT>['content'];
    finishReason: StepResult<TOOLS, RUNTIME_CONTEXT>['finishReason'];
    rawFinishReason: StepResult<TOOLS, RUNTIME_CONTEXT>['rawFinishReason'];
    usage: StepResult<TOOLS, RUNTIME_CONTEXT>['usage'];
    warnings: StepResult<TOOLS, RUNTIME_CONTEXT>['warnings'];
    request: StepResult<TOOLS, RUNTIME_CONTEXT>['request'];
    response: StepResult<TOOLS, RUNTIME_CONTEXT>['response'];
    providerMetadata: StepResult<TOOLS, RUNTIME_CONTEXT>['providerMetadata'];
  }) {
    this.callId = callId;
    this.stepNumber = stepNumber;
    this.model = { provider, modelId };
    this.runtimeContext = runtimeContext;
    this.toolsContext = toolsContext;
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
