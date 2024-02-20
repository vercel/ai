import { ChatPrompt } from '../prompt/chat-prompt';
import { Delta } from './delta';

export interface MessageGenerator {
  doStreamText(prompt: ChatPrompt): PromiseLike<ReadableStream<Delta<unknown>>>;
}
