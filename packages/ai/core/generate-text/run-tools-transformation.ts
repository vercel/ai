import {
  LanguageModelV2CallWarning,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { generateId, ModelMessage } from '@ai-sdk/provider-utils';
import { Tracer } from '@opentelemetry/api';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { FinishReason, LanguageModelUsage, ProviderMetadata } from '../types';
import { DefaultGeneratedFileWithType, GeneratedFile } from './generated-file';
import { parseToolCall } from './parse-tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { ToolErrorUnion, ToolResultUnion } from './tool-output';
import { ToolSet } from './tool-set';
import { Source } from '../types/language-model';
import { ToolCallUnion } from './tool-call';

export type SingleRequestTextStreamPart<TOOLS extends ToolSet> =
  // Text blocks:
  | {
      type: 'text-start';
      providerMetadata?: ProviderMetadata;
      id: string;
    }
  | {
      type: 'text-delta';
      id: string;
      providerMetadata?: ProviderMetadata;
      delta: string;
    }
  | {
      type: 'text-end';
      providerMetadata?: ProviderMetadata;
      id: string;
    }

  // Reasoning blocks:
  | {
      type: 'reasoning-start';
      providerMetadata?: ProviderMetadata;
      id: string;
    }
  | {
      type: 'reasoning-delta';
      id: string;
      providerMetadata?: ProviderMetadata;
      delta: string;
    }
  | {
      type: 'reasoning-end';
      id: string;
      providerMetadata?: ProviderMetadata;
    }

  // Tool calls:
  | {
      type: 'tool-input-start';
      id: string;
      toolName: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'tool-input-delta';
      id: string;
      delta: string;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'tool-input-end';
      id: string;
      providerMetadata?: ProviderMetadata;
    }
  | ({ type: 'source' } & Source)
  | { type: 'file'; file: GeneratedFile } // different because of GeneratedFile object
  | ({ type: 'tool-call' } & ToolCallUnion<TOOLS>)
  | ({ type: 'tool-result' } & ToolResultUnion<TOOLS>)
  | ({ type: 'tool-error' } & ToolErrorUnion<TOOLS>)
  | { type: 'file'; file: GeneratedFile } // different because of GeneratedFile object
  | { type: 'stream-start'; warnings: LanguageModelV2CallWarning[] }
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
  | { type: 'error'; error: unknown }
  | { type: 'raw'; rawValue: unknown };

export function runToolsTransformation<TOOLS extends ToolSet>({
  tools,
  generatorStream,
  tracer,
  telemetry,
  system,
  messages,
  abortSignal,
  repairToolCall,
}: {
  tools: TOOLS | undefined;
  generatorStream: ReadableStream<LanguageModelV2StreamPart>;
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

  // keep track of outstanding tool results for stream closing:
  const outstandingToolResults = new Set<string>();

  // keep track of tool inputs for provider-side tool results
  const toolInputs = new Map<string, unknown>();

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
        case 'text-start':
        case 'text-delta':
        case 'text-end':
        case 'reasoning-start':
        case 'reasoning-delta':
        case 'reasoning-end':
        case 'tool-input-start':
        case 'tool-input-delta':
        case 'tool-input-end':
        case 'source':
        case 'response-metadata':
        case 'error':
        case 'raw': {
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

        case 'finish': {
          finishChunk = {
            type: 'finish',
            finishReason: chunk.finishReason,
            usage: chunk.usage,
            providerMetadata: chunk.providerMetadata,
          };
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

            toolInputs.set(toolCall.toolCallId, toolCall.input);

            if (tool.onInputAvailable != null) {
              await tool.onInputAvailable({
                input: toolCall.input,
                toolCallId: toolCall.toolCallId,
                messages,
                abortSignal,
              });
            }

            // Only execute tools that are not provider-executed:
            if (tool.execute != null && toolCall.providerExecuted !== true) {
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
                    'ai.toolCall.input': {
                      output: () => JSON.stringify(toolCall.input),
                    },
                  },
                }),
                tracer,
                fn: async span => {
                  let output: unknown;

                  try {
                    output = await tool.execute!(toolCall.input, {
                      toolCallId: toolCall.toolCallId,
                      messages,
                      abortSignal,
                    });
                  } catch (error) {
                    toolResultsStreamController!.enqueue({
                      ...toolCall,
                      type: 'tool-error',
                      error,
                    } satisfies ToolErrorUnion<TOOLS>);

                    outstandingToolResults.delete(toolExecutionId);
                    attemptClose();
                    return;
                  }

                  toolResultsStreamController!.enqueue({
                    ...toolCall,
                    type: 'tool-result',
                    output,
                  } satisfies ToolResultUnion<TOOLS>);

                  outstandingToolResults.delete(toolExecutionId);
                  attemptClose();

                  // record telemetry
                  try {
                    span.setAttributes(
                      selectTelemetryAttributes({
                        telemetry,
                        attributes: {
                          'ai.toolCall.output': {
                            output: () => JSON.stringify(output),
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
              });
            }
          } catch (error) {
            toolResultsStreamController!.enqueue({ type: 'error', error });
          }

          break;
        }

        case 'tool-result': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          if (chunk.isError) {
            toolResultsStreamController!.enqueue({
              type: 'tool-error',
              toolCallId: chunk.toolCallId,
              toolName,
              input: toolInputs.get(chunk.toolCallId),
              providerExecuted: chunk.providerExecuted,
              error: chunk.result,
            } as ToolErrorUnion<TOOLS>);
          } else {
            controller.enqueue({
              type: 'tool-result',
              toolCallId: chunk.toolCallId,
              toolName,
              input: toolInputs.get(chunk.toolCallId),
              output: chunk.result,
              providerExecuted: chunk.providerExecuted,
            } as ToolResultUnion<TOOLS>);
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
