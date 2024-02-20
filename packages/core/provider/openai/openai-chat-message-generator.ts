import OpenAI from 'openai';
import { ChatPrompt, Delta } from '../../function';
import { InstructionPrompt } from '../../function/prompt/instruction-prompt';
import { MessageGenerator } from '../../function/stream-message/message-generator';
import { OpenAIStream } from '../../streams';
import { convertToOpenAIChatPrompt } from './openai-chat-prompt';

export interface OpenAIChatMessageGeneratorSettings {
  modelId: string;
}

export class OpenAIChatMessageGenerator implements MessageGenerator {
  readonly modelId: string;

  constructor({ modelId }: OpenAIChatMessageGeneratorSettings) {
    this.modelId = modelId;
  }

  async doStreamText(
    prompt: string | InstructionPrompt | ChatPrompt,
  ): Promise<ReadableStream<Delta<unknown>>> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: convertToOpenAIChatPrompt(prompt),
    });

    return OpenAIStream(response);
  }

  extractTextDelta(delta: unknown): string | undefined {
    throw new Error('Method not implemented.');
  }
}
