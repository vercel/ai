import { LanguageModelV1CallWarning } from './language-model-v1-call-warning';
import { LanguageModelV1CallOptions } from './language-model-v1-call-options';

export interface LanguageModel {
  /**
   * Default object generation mode that should be used with this model when
   * no mode is specified. Should be the mode with the best results for this
   * model. `undefined` can be returned if object generation is not supported.
   *
   * This is needed to generate the best objects possible w/o requiring the
   * user to explicitly specify the object generation mode.
   */
  readonly defaultObjectGenerationMode: 'json' | 'tool' | 'grammar' | undefined;

  doGenerate(options: LanguageModelV1CallOptions): PromiseLike<{
    text?: string;
    toolCalls?: Array<LanguageModelToolCall>;
    warnings: LanguageModelV1CallWarning[];
  }>;

  doStream(options: LanguageModelV1CallOptions): PromiseLike<{
    stream: ReadableStream<LanguageModelStreamPart>;
    warnings: LanguageModelV1CallWarning[];
  }>;
}

export type ErrorStreamPart = {
  type: 'error';
  error: unknown;
};

export type LanguageModelToolCall = {
  toolCallId: string;
  toolName: string;
  args: string;
};

type ToolCallStreamPart = {
  type: 'tool-call';
} & LanguageModelToolCall;

type ToolCallDeltaStreamPart = {
  type: 'tool-call-delta';
  toolCallId: string;
  toolName: string;
  argsTextDelta: string;
};

type TextDeltaStreamPart = {
  type: 'text-delta';
  textDelta: string;
};

export type LanguageModelStreamPart =
  | TextDeltaStreamPart
  | ToolCallDeltaStreamPart
  | ToolCallStreamPart
  | ErrorStreamPart;
