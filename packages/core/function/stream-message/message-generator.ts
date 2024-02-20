import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { Delta } from './delta';

export interface MessageGenerator {
  doStreamText(
    prompt: string | InstructionPrompt | ChatPrompt,
  ): PromiseLike<ReadableStream<Delta<unknown>>>;
}
