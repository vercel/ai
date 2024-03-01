import { ChatPrompt } from './prompt/chat-prompt';

export interface LanguageModel {
  objectMode: ObjectMode;

  doGenerate(options: LanguageModelCallOptions): PromiseLike<{
    text?: string;
    toolCalls?: Array<ToolCall>;
  }>;

  doStream(
    options: LanguageModelCallOptions,
  ): PromiseLike<ReadableStream<LanguageModelStreamPart>>;
}

export type ObjectMode = 'tool' | 'json';

type LanguageModelCallOptions = {
  mode:
    | { type: 'regular'; tools?: Array<LanguageModelToolDefinition> }
    | { type: 'object-json' }
    | { type: 'object-tool'; tool: LanguageModelToolDefinition };
  prompt: ChatPrompt;
};

export interface LanguageModelSettings {
  maxTokens?: number;
}

type LanguageModelToolDefinition = {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
};

export type ErrorStreamPart = {
  type: 'error';
  error: unknown;
};

type ToolCall = {
  toolCallId: string;
  toolName: string;
  args: string;
};

type ToolCallStreamPart = {
  type: 'tool-call';
} & ToolCall;

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
