import { nanoid } from 'nanoid';
import { LanguageModelStreamPart } from '../language-model';
import { Tool } from '../tool';
import { TextStreamPart } from './stream-text';
import { parseToolCall } from './tool-call';

export function runToolsTransformation<TOOLS extends Record<string, Tool>>({
  tools,
  generatorStream,
}: {
  tools?: TOOLS;
  generatorStream: ReadableStream<LanguageModelStreamPart>;
}): ReadableStream<TextStreamPart<TOOLS>> {
  let canClose = false;
  const outstandingToolCalls = new Set<string>();

  // tool results stream
  let toolResultsStreamController: ReadableStreamDefaultController<
    TextStreamPart<TOOLS>
  > | null = null;
  const toolResultsStream = new ReadableStream<TextStreamPart<TOOLS>>({
    start(controller) {
      toolResultsStreamController = controller;
    },
  });

  // forward stream
  const forwardStream = new TransformStream<
    LanguageModelStreamPart,
    TextStreamPart<TOOLS>
  >({
    transform(
      chunk: LanguageModelStreamPart,
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
    ) {
      const chunkType = chunk.type;

      switch (chunkType) {
        // forward:
        case 'text-delta':
        case 'error': {
          controller.enqueue(chunk);
          break;
        }

        // process
        case 'tool-call': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          if (tools == null) {
            // TODO add dedicated error to list of errors (NoSuchToolError)
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: `Tool ${chunk.toolName} not found (no tools provided)`,
            });
            break;
          }

          const tool = tools[toolName];

          if (tool == null) {
            // TODO add dedicated error to list of errors (NoSuchToolError)
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: `Tool ${chunk.toolName} not found`,
            });

            break;
          }

          // TODO try catch or safe parse
          const toolCall = parseToolCall({
            toolCall: chunk,
            tools,
          });

          // TODO dedicate tool call error (InvalidToolArgumentsError)
          // toolResultsStreamController!.enqueue({
          //   type: 'error',
          //   error: `Tool call ${toolName} has invalid arguments: ${parseResult.error}`,
          // });

          controller.enqueue({
            type: 'tool-call',
            ...toolCall,
          });

          if (tool.execute != null) {
            const toolExecutionId = nanoid(); // use our own id to guarantee uniqueness
            outstandingToolCalls.add(toolExecutionId);

            // Note: we don't await the tool execution here, because we want to process
            // the next chunk as soon as possible. This is important for the case where
            // the tool execution takes a long time.
            tool.execute(toolCall.args).then(
              (result: any) => {
                toolResultsStreamController!.enqueue({
                  type: 'tool-result',
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName as string, // TODO fix typing
                  result,
                });

                outstandingToolCalls.delete(toolExecutionId);

                // close the tool results controller if no more outstanding tool calls
                if (canClose && outstandingToolCalls.size === 0) {
                  toolResultsStreamController!.close();
                }
              },
              (error: any) => {
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

          break;
        }

        // ignore
        case 'tool-call-delta': {
          break;
        }

        default: {
          const _exhaustiveCheck: never = chunkType;
          throw new Error(`Unhandled chunk type: ${_exhaustiveCheck}`);
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
  return new ReadableStream<TextStreamPart<TOOLS>>({
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
