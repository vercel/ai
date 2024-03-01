import { nanoid } from 'nanoid';
import { Tool } from '../tool/tool';
import { ToolDefinition } from '../tool/tool-definition';
import { ErrorStreamPart, LanguageModelStreamPart } from '../language-model';
import { ToolResultStreamPart } from './tool-result-stream-part';

export function runToolsTransformation({
  tools = [],
  generatorStream,
}: {
  tools?: Array<
    ToolDefinition<string, unknown> | Tool<string, unknown, unknown>
  >;
  generatorStream: ReadableStream<LanguageModelStreamPart>;
}): ReadableStream<LanguageModelStreamPart | ToolResultStreamPart> {
  let canClose = false;
  const outstandingToolCalls = new Set<string>();

  // tool results stream
  let toolResultsStreamController: ReadableStreamDefaultController<
    ToolResultStreamPart | ErrorStreamPart
  > | null = null;
  const toolResultsStream = new ReadableStream<
    ToolResultStreamPart | ErrorStreamPart
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
      controller: TransformStreamDefaultController<
        LanguageModelStreamPart | ToolResultStreamPart
      >,
    ) {
      // TODO need to transform tool calls (omit tool call deltas, add typed tool calls)
      controller?.enqueue(chunk);

      if (chunk.type === 'tool-call') {
        const tool = tools.find(tool => tool.name === chunk.toolName);

        if (tool == null) {
          // TODO dedicated error type (NoSuchToolError)
          toolResultsStreamController!.enqueue({
            type: 'error',
            error: `Tool ${chunk.toolName} not found`,
          });
        } else if ('execute' in tool) {
          const toolExecutionId = nanoid(); // use our own id to guarantee uniqueness
          outstandingToolCalls.add(toolExecutionId);

          // TODO full tool call args parsing & validation
          tool.execute(JSON.parse(chunk.args)).then(
            result => {
              toolResultsStreamController!.enqueue({
                type: 'tool-result',
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
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
  return new ReadableStream<LanguageModelStreamPart | ToolResultStreamPart>({
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
            controller.close();
          },
        }),
      );
    },
  });
}
