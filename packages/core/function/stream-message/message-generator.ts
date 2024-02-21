import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { MessageStreamPart } from './message-stream-part';

export interface MessageGenerator {
  doStreamText(
    prompt: string | InstructionPrompt | ChatPrompt,
  ): PromiseLike<ReadableStream<MessageStreamPart>>;
}
