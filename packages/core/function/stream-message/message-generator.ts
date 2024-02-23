import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { ToolDefinition } from '../tool/ToolDefinition';

export interface MessageGenerator {
  doStreamText(options: {
    prompt: string | InstructionPrompt | ChatPrompt;
    tools?: Array<ToolDefinition<string, unknown>>;
  }): PromiseLike<ReadableStream<MessageGeneratorStreamPart>>;
}

export type MessageGeneratorErrorStreamPart = {
  type: 'error';
  error: unknown;
};

export type MessageGeneratorStreamPart =
  | {
      type: 'text-delta';
      textDelta: string;
    }
  | {
      type: 'tool-call';
      id: string | null;
      name: string;
      args: unknown;
    }
  | MessageGeneratorErrorStreamPart;
