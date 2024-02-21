import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';
import { ToolDefinition } from '../tool/ToolDefinition';
import {
  MessageGenerator,
  MessageGeneratorStreamPart,
} from './message-generator';
import { MessageStreamPart } from './message-stream-part';
import { StreamMessageTextResponse } from './stream-message-text-response';

/**
 * Streams a complex message object. Beyond just text streaming, it can stream tool calls, data, annotations, etc.
 *
 * STATUS: WIP. Only supports text streaming for now.
 */
export async function streamMessage({
  model,
  prompt,
  tools,
}: {
  model: MessageGenerator;
  prompt: string | InstructionPrompt | ChatPrompt;
  tools?: Array<ToolDefinition<string, unknown>>;
}): Promise<StreamMessageResponse> {
  const modelStream = await model.doStreamText({
    prompt,
    tools,
  });

  // TODO tool handling: transform stream to handle tool calls
  let controller: TransformStreamDefaultController<MessageStreamPart> | null =
    null;
  let canClose = false;

  const toolStream = modelStream.pipeThrough(
    new TransformStream<MessageGeneratorStreamPart, MessageStreamPart>({
      start(controllerArg) {
        console.log('start');
        controller = controllerArg;
      },

      transform(chunk, controller) {
        console.log('chunk', chunk);
        controller?.enqueue(chunk);

        if (chunk.type === 'tool-call') {
          // if tool is available and executable, call it
          // TODO handle tool calls
        }
      },

      flush() {
        console.log('flush');
        // check outstanding tool calls
        // if none, close

        canClose = true;
      },
    }),
  );

  return {
    toTextResponse() {
      return new StreamMessageTextResponse(toolStream);
    },
  };
}

// TODO implement async iterable as well as stream
export interface StreamMessageResponse {
  // TODO abort(): void;

  toTextResponse(): Response;
}
