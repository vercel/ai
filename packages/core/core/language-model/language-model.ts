import { ChatPrompt } from './prompt/chat-prompt';
import { InstructionPrompt } from './prompt/instruction-prompt';

export interface LanguageModelSettings {
  maxTokens?: number;
}

export type ObjectMode = 'tool' | 'json';

export interface LanguageModel {
  doGenerate(options: { prompt: InstructionPrompt | ChatPrompt }): PromiseLike<{
    text: string;
  }>;

  doStream(options: {
    prompt: InstructionPrompt | ChatPrompt;
    tools?: Array<LanguageModelToolDefinition>;
  }): PromiseLike<ReadableStream<LanguageModelStreamPart>>;

  objectMode: ObjectMode;

  doGenerateJsonText(options: {
    mode:
      | { type: 'json' }
      | { type: 'tool'; tool: LanguageModelToolDefinition };
    prompt: InstructionPrompt;
  }): PromiseLike<{
    text?: string;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      args: string;
    }>;
  }>;

  doStreamJsonText(options: {
    schema: Record<string, unknown>;
    prompt: InstructionPrompt;
  }): PromiseLike<
    ReadableStream<
      { type: 'json-text-delta'; textDelta: string } | ErrorStreamPart
    >
  >;
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

type ToolCallStreamPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: unknown;
};

type TextDeltaStreamPart = {
  type: 'text-delta';
  textDelta: string;
};

export type LanguageModelStreamPart =
  | TextDeltaStreamPart
  | ToolCallStreamPart
  | ErrorStreamPart;
