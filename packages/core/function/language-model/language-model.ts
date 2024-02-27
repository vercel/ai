import { ChatPrompt } from './prompt/chat-prompt';
import { InstructionPrompt } from './prompt/instruction-prompt';

export interface LanguageModel {
  // TODO include usage data
  // TODO support tool calls
  doGenerate(options: { prompt: InstructionPrompt | ChatPrompt }): PromiseLike<{
    text: string;
  }>;

  doGenerateJsonText(options: {
    schema: Record<string, unknown>;
    prompt: InstructionPrompt | ChatPrompt;
  }): PromiseLike<{
    jsonText: string;
  }>;

  doStream(options: {
    prompt: InstructionPrompt | ChatPrompt;
    tools?: Array<{
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }>;
  }): PromiseLike<ReadableStream<LanguageModelStreamPart>>;

  doStreamJsonText(options: {
    schema: Record<string, unknown>;
    prompt: InstructionPrompt | ChatPrompt;
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
