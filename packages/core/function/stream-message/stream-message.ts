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

  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = modelStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          break;
        }
        const text = model.extractTextDelta(value);
        if (text) controller.enqueue(text);
      }
    },
  });

  // TODO real response object
  return { toResponse: () => new Response(transformedStream) };
}

// TODO implement async iterable as well as stream
export interface StreamMessageResponse {
  // TODO abort(): void;

  toResponse(): Response;
}
