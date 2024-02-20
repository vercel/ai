import { ChatPrompt, Delta } from '../../function';
import { MessageGenerator } from '../../function/stream-message/message-generator';

export interface OpenAIChatMessageGeneratorSettings {
  modelId: string;
}

export class OpenAIChatMessageGenerator implements MessageGenerator {
  readonly modelId: string;

  constructor({ modelId }: OpenAIChatMessageGeneratorSettings) {
    this.modelId = modelId;
  }

  doStreamText(
    prompt: ChatPrompt,
  ): PromiseLike<ReadableStream<Delta<unknown>>> {
    // convert prompt to `openai chat (or completion) format --> happens in provider
    throw new Error('Method not implemented.');
  }

  extractTextDelta(delta: unknown): string | undefined {
    throw new Error('Method not implemented.');
  }
}
