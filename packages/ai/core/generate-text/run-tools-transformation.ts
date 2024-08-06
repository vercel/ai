import { LanguageModelV1StreamPart } from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/ui-utils';
import { Tracer } from '@opentelemetry/api';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { CoreTool } from '../tool';
import { calculateCompletionTokenUsage } from '../types/token-usage';
import { TextStreamPart } from './stream-text-result';
import { parseToolCall } from './tool-call';

export function runToolsTransformation<TOOLS extends Record<string, CoreTool>>({
  tools,
  generatorStream,
  toolCallStreaming,
  tracer,
  telemetry,
}: {
  tools: TOOLS | undefined;
  generatorStream: ReadableStream<LanguageModelV1StreamPart>;
  toolCallStreaming: boolean;
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
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

  // keep track of active tool calls
  const activeToolCalls: Record<string, boolean> = {};

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

        // forward with less information:
        case 'tool-call-delta': {
          if (toolCallStreaming) {
            if (!activeToolCalls[chunk.toolCallId]) {
              controller.enqueue({
                type: 'tool-call-streaming-start',
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
              });

              activeToolCalls[chunk.toolCallId] = true;
            }

            controller.enqueue({
              type: 'tool-call-delta',
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              argsTextDelta: chunk.argsTextDelta,
            });
          }
          break;
        }

        // process tool call:
        case 'tool-call': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          if (tools == null) {
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: new NoSuchToolError({ toolName: chunk.toolName }),
            });
            break;
          }

          const tool = tools[toolName];

          if (tool == null) {
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: new NoSuchToolError({
                toolName: chunk.toolName,
                availableTools: Object.keys(tools),
              }),
            });

            break;
          }

          try {
            const toolCall = parseToolCall({
              toolCall: chunk,
              tools,
            });

            controller.enqueue(toolCall);

            if (tool.execute != null) {
              const toolExecutionId = generateId(); // use our own id to guarantee uniqueness
              outstandingToolCalls.add(toolExecutionId);

              // Note: we don't await the tool execution here (by leaving out 'await' on recordSpan),
              // because we want to process the next chunk as soon as possible.
              // This is important for the case where the tool execution takes a long time.
              recordSpan({
                name: 'ai.toolCall',
                attributes: selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    ...assembleOperationName({
                      operationName: 'ai.toolCall',
                      telemetry,
                    }),
                    'ai.toolCall.name': toolCall.toolName,
                    'ai.toolCall.id': toolCall.toolCallId,
                    'ai.toolCall.args': {
                      output: () => JSON.stringify(toolCall.args),
                    },
                  },
                }),
                tracer,
                fn: async span =>
                  tool.execute!(toolCall.args).then(
                    (result: any) => {
                      toolResultsStreamController!.enqueue({
                        ...toolCall,
                        type: 'tool-result',
                        result,
                      } as any);

                      outstandingToolCalls.delete(toolExecutionId);

                      // close the tool results controller if no more outstanding tool calls
                      if (canClose && outstandingToolCalls.size === 0) {
                        toolResultsStreamController!.close();
                      }

                      // record telemetry
                      try {
                        span.setAttributes(
                          selectTelemetryAttributes({
                            telemetry,
                            attributes: {
                              'ai.toolCall.result': {
                                output: () => JSON.stringify(result),
                              },
                            },
                          }),
                        );
                      } catch (ignored) {
                        // JSON stringify might fail if the result is not serializable,
                        // in which case we just ignore it. In the future we might want to
                        // add an optional serialize method to the tool interface and warn
                        // if the result is not serializable.
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
                  ),
              });
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
            logprobs: chunk.logprobs,
            usage: calculateCompletionTokenUsage(chunk.usage),
          });
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
      // need to wait for both pipes so there are no dangling promises that
      // can cause uncaught promise rejections when the stream is aborted
      return Promise.all([
        generatorStream.pipeThrough(forwardStream).pipeTo(
          new WritableStream({
            write(chunk) {
              controller.enqueue(chunk);
            },
            close() {
              // the generator stream controller is automatically closed when it's consumed
            },
          }),
        ),
        toolResultsStream.pipeTo(
          new WritableStream({
            write(chunk) {
              controller.enqueue(chunk);
            },
            close() {
              controller.close();
            },
          }),
        ),
      ]);
    },
  });
}
