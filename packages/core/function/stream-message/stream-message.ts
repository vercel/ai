import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { MessageGenerator } from './message-generator';
import { StreamMessageTextResponse } from './stream-message-text-response';

/**
 * Streams a complex message object. Beyond just text streaming, it can stream tool calls, data, annotations, etc.
 *
 * STATUS: WIP. Only supports text streaming for now.
 */
export async function streamMessage({
  model,
  prompt,
}: {
  model: MessageGenerator;
  prompt: string | InstructionPrompt | ChatPrompt;
}): Promise<StreamMessageResponse> {
  const modelStream = await model.doStreamText(prompt);

  return {
    toTextResponse() {
      return new StreamMessageTextResponse(modelStream);
    },
  };
}

// TODO implement async iterable as well as stream
export interface StreamMessageResponse {
  // TODO abort(): void;

  toTextResponse(): Response;
}
