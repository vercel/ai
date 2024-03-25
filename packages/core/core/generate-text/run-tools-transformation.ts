import {
  LanguageModelV1StreamPart,
  NoSuchToolError,
} from '../../ai-model-specification';
import { generateId } from '../../shared/generate-id';
import { ExperimentalTool } from '../tool';
import { TextStreamPart } from './stream-text';
import { parseToolCall } from './tool-call';

export function runToolsTransformation<
  TOOLS extends Record<string, ExperimentalTool>,
>({
  tools,
  generatorStream,
}: {
  tools?: TOOLS;
  generatorStream: ReadableStream<LanguageModelV1StreamPart>;
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
    LanguageModelV1StreamPart,
    TextStreamPart<TOOLS>
  >({
    transform(
      chunk: LanguageModelV1StreamPart,
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

        // process tool call:
        case 'tool-call': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          if (tools == null) {
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: new NoSuchToolError({
                message: `Tool ${chunk.toolName} not found (no tools provided).`,
                toolName: chunk.toolName,
              }),
            });
            break;
          }

          const tool = tools[toolName];

          if (tool == null) {
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: new NoSuchToolError({
                message: `Tool ${chunk.toolName} not found.`,
                toolName: chunk.toolName,
              }),
            });

            break;
          }

          try {
            const toolCall = parseToolCall({
              toolCall: chunk,
              tools,
            });

            controller.enqueue({
              type: 'tool-call',
              ...toolCall,
            });

            if (tool.execute != null) {
              const toolExecutionId = generateId(); // use our own id to guarantee uniqueness
              outstandingToolCalls.add(toolExecutionId);

              // Note: we don't await the tool execution here, because we want to process
              // the next chunk as soon as possible. This is important for the case where
              // the tool execution takes a long time.
              tool.execute(toolCall.args).then(
                (result: any) => {
                  toolResultsStreamController!.enqueue({
                    type: 'tool-result',
                    ...toolCall,
                    result,
                  } as any);

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
          } catch (error) {
            toolResultsStreamController!.enqueue({
              type: 'error',
              error,
            });
          }

          break;
        }

        // process finish:
        case 'finish': {
          controller.enqueue({
            type: 'finish',
            finishReason: chunk.finishReason,
            usage: {
              promptTokens: chunk.usage.promptTokens,
              completionTokens: chunk.usage.completionTokens,
              totalTokens:
                chunk.usage.promptTokens + chunk.usage.completionTokens,
            },
          });
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
