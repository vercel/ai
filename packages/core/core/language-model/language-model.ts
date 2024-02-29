import { ChatPrompt } from './prompt/chat-prompt';
import { InstructionPrompt } from './prompt/instruction-prompt';

export interface LanguageModelSettings {
  maxTokens?: number;
}

export type ObjectMode = 'tool' | 'json';

export interface LanguageModel {
  objectMode: ObjectMode;

  doGenerate(options: {
    mode:
      | { type: 'regular' } // TODO tools
      | { type: 'object-json' }
      | { type: 'object-tool'; tool: LanguageModelToolDefinition };
    prompt: ChatPrompt;
  }): PromiseLike<{
    text?: string;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      args: string;
    }>;
  }>;

  doStream(options: {
    prompt: InstructionPrompt | ChatPrompt;
    tools?: Array<LanguageModelToolDefinition>;
  }): PromiseLike<ReadableStream<LanguageModelStreamPart>>;

  doStreamJsonText(options: {
    mode:
      | { type: 'json' }
      | { type: 'tool'; tool: LanguageModelToolDefinition };
    prompt: ChatPrompt;
  }): PromiseLike<ReadableStream<LanguageModelStreamPart>>;
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
