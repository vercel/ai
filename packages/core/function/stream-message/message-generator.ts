import { ChatPrompt } from '../prompt/chat-prompt';
import { Delta } from './delta';

export interface MessageGenerator {
  // TODO what about function calls etc
  doStreamText(prompt: ChatPrompt): PromiseLike<ReadableStream<Delta<unknown>>>;

  extractTextDelta(delta: unknown): string | undefined;
}
