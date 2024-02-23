import { nanoid } from 'nanoid';
import { Tool } from '../tool/Toolx';
import { ToolDefinition } from '../tool/tool-definition';
import {
  LanguageModelErrorStreamPart,
  LanguageModelStreamPart,
} from '../language-model';
import {
  MessageStreamPart,
  ToolResultMessageStreamPart,
} from './message-stream-part';

export function runToolsTransformation({
  tools,
  generatorStream,
}: {
  tools: Array<
    ToolDefinition<string, unknown> | Tool<string, unknown, unknown>
  >;
  generatorStream: ReadableStream<LanguageModelStreamPart>;
}): ReadableStream<MessageStreamPart> {
  let canClose = false;
  const outstandingToolCalls = new Set<string>();

  // tool results stream
  let toolResultsStreamController: ReadableStreamDefaultController<
    ToolResultMessageStreamPart | LanguageModelErrorStreamPart
  > | null = null;
  const toolResultsStream = new ReadableStream<
    ToolResultMessageStreamPart | LanguageModelErrorStreamPart
  >({
    start(controller) {
      toolResultsStreamController = controller;
    },
  });

  // forward stream
  const forwardStream = new TransformStream<
    LanguageModelStreamPart,
    LanguageModelStreamPart
  >({
    transform(
      chunk: LanguageModelStreamPart,
      controller: TransformStreamDefaultController<MessageStreamPart>,
    ) {
      controller?.enqueue(chunk);

      if (chunk.type === 'tool-call') {
        const tool = tools.find(tool => tool.name === chunk.name);

        if (tool == null) {
          toolResultsStreamController!.enqueue({
            type: 'error',
            error: `Tool ${chunk.name} not found`,
          });
        } else if ('execute' in tool) {
          const toolExecutionId = nanoid(); // use our own id to guarantee uniqueness
          outstandingToolCalls.add(toolExecutionId);

          tool.execute(chunk.args).then(
            result => {
              toolResultsStreamController!.enqueue({
                type: 'tool-result',
                id: chunk.id,
                result,
              });

              outstandingToolCalls.delete(toolExecutionId);

              // close the tool results controller if no more outstanding tool calls
              if (canClose && outstandingToolCalls.size === 0) {
                toolResultsStreamController!.close();
              }
            },
            error => {
              toolResultsStreamController!.enqueue({
                type: 'error',
                error,
              });

              outstandingToolCalls.delete(toolExecutionId);

              // close the tool results controller if no more outstanding tool calls
              if (canClose && outstandingToolCalls.size === 0) {
                toolResultsStreamController!.close();
              }
            },
          );
        }
      }
    },

    flush() {
      canClose = true;

      if (outstandingToolCalls.size === 0) {
        toolResultsStreamController!.close();
      }
    },
  });

  // combine the generator stream and the tool results stream
  return new ReadableStream<MessageStreamPart>({
    async start(controller) {
      generatorStream.pipeThrough(forwardStream).pipeTo(
        new WritableStream({
          write(chunk) {
            controller.enqueue(chunk);
          },
          close() {
            // the generator stream controller is automatically closed when it's consumed
          },
        }),
      );

      toolResultsStream.pipeTo(
        new WritableStream({
          write(chunk) {
            controller.enqueue(chunk);
          },
          close() {
            // the tool results stream controller is closed elsewhere
          },
        }),
      );
    },
  });
}
