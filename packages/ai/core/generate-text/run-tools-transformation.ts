import {
  LanguageModelV2CallWarning,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/provider-utils';
import { Tracer } from '@opentelemetry/api';
import { ToolExecutionError } from '../../src/error/tool-execution-error';
import { ModelMessage } from '../prompt/message';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { FinishReason, LanguageModelUsage, ProviderMetadata } from '../types';
import { ContentPart } from './content-part';
import { DefaultGeneratedFileWithType } from './generated-file';
import { parseToolCall } from './parse-tool-call';
import { ToolCallRepairFunction } from './tool-call-repair';
import { ToolSet } from './tool-set';

export type SingleRequestTextStreamPart<TOOLS extends ToolSet> =
  | ContentPart<TOOLS>
  | { type: 'stream-start'; warnings: LanguageModelV2CallWarning[] }
  | { type: 'reasoning-part-finish' }
  | {
      type: 'tool-call-streaming-start';
      toolCallId: string;
      toolName: string;
    }
  | {
      type: 'tool-call-delta';
      toolCallId: string;
      toolName: string;
      argsTextDelta: string;
    }
  | {
      type: 'response-metadata';
      id?: string;
      timestamp?: Date;
      modelId?: string;
    }
  | {
      type: 'finish';
      finishReason: FinishReason;
      usage: LanguageModelUsage;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'error';
      error: unknown;
    };

export function runToolsTransformation<TOOLS extends ToolSet>({
  tools,
  generatorStream,
  toolCallStreaming,
  tracer,
  telemetry,
  system,
  messages,
  abortSignal,
  repairToolCall,
}: {
  tools: TOOLS | undefined;
  generatorStream: ReadableStream<LanguageModelV2StreamPart>;
  toolCallStreaming: boolean;
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
  system: string | undefined;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
}): ReadableStream<SingleRequestTextStreamPart<TOOLS>> {
  // tool results stream
  let toolResultsStreamController: ReadableStreamDefaultController<
    SingleRequestTextStreamPart<TOOLS>
  > | null = null;
  const toolResultsStream = new ReadableStream<
    SingleRequestTextStreamPart<TOOLS>
  >({
    start(controller) {
      toolResultsStreamController = controller;
    },
  });

  // keep track of active tool calls for tool call streaming:
  const activeToolCalls: Record<string, boolean> = {};

  // keep track of outstanding tool results for stream closing:
  const outstandingToolResults = new Set<string>();

  let canClose = false;
  let finishChunk:
    | (SingleRequestTextStreamPart<TOOLS> & { type: 'finish' })
    | undefined = undefined;

  function attemptClose() {
    // close the tool results controller if no more outstanding tool calls
    if (canClose && outstandingToolResults.size === 0) {
      // we delay sending the finish chunk until all tool results (incl. delayed ones)
      // are received to ensure that the frontend receives tool results before a message
      // finish event arrives.
      if (finishChunk != null) {
        toolResultsStreamController!.enqueue(finishChunk);
      }

      toolResultsStreamController!.close();
    }
  }

  // forward stream
  const forwardStream = new TransformStream<
    LanguageModelV2StreamPart,
    SingleRequestTextStreamPart<TOOLS>
  >({
    async transform(
      chunk: LanguageModelV2StreamPart,
      controller: TransformStreamDefaultController<
        SingleRequestTextStreamPart<TOOLS>
      >,
    ) {
      const chunkType = chunk.type;

      switch (chunkType) {
        // forward:
        case 'stream-start':
        case 'finish':
        case 'text':
        case 'reasoning':
        case 'reasoning-part-finish':
        case 'source':
        case 'response-metadata':
        case 'error': {
          controller.enqueue(chunk);
          break;
        }

        case 'file': {
          controller.enqueue({
            type: 'file',
            file: new DefaultGeneratedFileWithType({
              data: chunk.data,
              mediaType: chunk.mediaType,
            }),
          });
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
          try {
            const toolCall = await parseToolCall({
              toolCall: chunk,
              tools,
              repairToolCall,
              system,
              messages,
            });

            controller.enqueue(toolCall);

            const tool = tools![toolCall.toolName];

            if (tool.execute != null) {
              const toolExecutionId = generateId(); // use our own id to guarantee uniqueness
              outstandingToolResults.add(toolExecutionId);

              // Note: we don't await the tool execution here (by leaving out 'await' on recordSpan),
              // because we want to process the next chunk as soon as possible.
              // This is important for the case where the tool execution takes a long time.
              recordSpan({
                name: 'ai.toolCall',
                attributes: selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    ...assembleOperationName({
                      operationId: 'ai.toolCall',
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
                  tool.execute!(toolCall.args, {
                    toolCallId: toolCall.toolCallId,
                    messages,
                    abortSignal,
                  }).then(
                    (result: any) => {
                      toolResultsStreamController!.enqueue({
                        ...toolCall,
                        type: 'tool-result',
                        result,
                      } as any);

                      outstandingToolResults.delete(toolExecutionId);

                      attemptClose();

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
                        error: new ToolExecutionError({
                          toolCallId: toolCall.toolCallId,
                          toolName: toolCall.toolName,
                          toolArgs: toolCall.args,
                          cause: error,
                        }),
                      });

                      outstandingToolResults.delete(toolExecutionId);
                      attemptClose();
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

        default: {
          const _exhaustiveCheck: never = chunkType;
          throw new Error(`Unhandled chunk type: ${_exhaustiveCheck}`);
        }
      }
    },

    flush() {
      canClose = true;
      attemptClose();
    },
  });

  // combine the generator stream and the tool results stream
  return new ReadableStream<SingleRequestTextStreamPart<TOOLS>>({
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
