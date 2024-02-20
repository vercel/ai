import { StreamingTextResponse } from '../../streams';
import { ChatPrompt } from '../prompt/chat-prompt';
import { MessageGenerator } from './message-generator';

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
  prompt: ChatPrompt;
}): Promise<StreamMessageResponse> {
  const modelStream = await model.doStreamText(prompt);

  return {
    toStreamingTextResponse() {
      return new StreamingTextResponse(modelStream);
    },
  };
}

// TODO implement async iterable as well as stream
export interface StreamMessageResponse {
  // TODO abort(): void;

  toStreamingTextResponse(): Response;
}
