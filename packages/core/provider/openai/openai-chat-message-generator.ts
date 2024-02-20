import OpenAI from 'openai';
import { ChatPrompt, Delta } from '../../function';
import { InstructionPrompt } from '../../function/prompt/instruction-prompt';
import { MessageGenerator } from '../../function/stream-message/message-generator';
import { OpenAIStream } from '../../streams';
import { convertToOpenAIChatPrompt } from './openai-chat-prompt';

export interface OpenAIChatMessageGeneratorSettings {
  id: string;
  maxTokens?: number;
  client?: OpenAI;
}

export class OpenAIChatMessageGenerator implements MessageGenerator {
  readonly settings: OpenAIChatMessageGeneratorSettings;

  constructor(settings: OpenAIChatMessageGeneratorSettings) {
    this.settings = settings;
  }

  get client() {
    return (
      this.settings.client ||
      new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    );
  }

  async doStreamText(
    prompt: string | InstructionPrompt | ChatPrompt,
  ): Promise<ReadableStream<Delta<unknown>>> {
    const response = await this.client.chat.completions.create({
      model: this.settings.id,
      max_tokens: this.settings.maxTokens,
      stream: true,
      messages: convertToOpenAIChatPrompt(prompt),
    });

    return OpenAIStream(response);
  }

  extractTextDelta(delta: unknown): string | undefined {
    throw new Error('Method not implemented.');
  }
}
