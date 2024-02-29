import { ChatPrompt } from './prompt/chat-prompt';
import { InstructionPrompt } from './prompt/instruction-prompt';

export interface LanguageModelSettings {
  maxTokens?: number;
}

export type ObjectMode = 'TOOL' | 'JSON';

export interface LanguageModel {
  doGenerate(options: { prompt: InstructionPrompt | ChatPrompt }): PromiseLike<{
    text: string;
  }>;

  doStream(options: {
    prompt: InstructionPrompt | ChatPrompt;
    tools?: Array<{
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }>;
  }): PromiseLike<ReadableStream<LanguageModelStreamPart>>;

  objectMode: ObjectMode;

  doGenerateJsonText(options: {
    schema: Record<string, unknown>;
    objectMode: ObjectMode;
    tools?: Array<{
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }>;
    prompt: InstructionPrompt;
  }): PromiseLike<{
    jsonText: string;
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
