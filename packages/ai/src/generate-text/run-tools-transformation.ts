import { SharedV4Warning } from '@ai-sdk/provider';
import {
  getErrorMessage,
  IdGenerator,
  ModelMessage,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import type { TelemetryIntegration } from '../telemetry/telemetry-integration';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { FinishReason, LanguageModelUsage, ProviderMetadata } from '../types';
import { Source } from '../types/language-model';
import { asLanguageModelUsage } from '../types/usage';
import { UglyTransformedStreamTextPart } from './create-stream-text-part-transform';
import { executeToolCall } from './execute-tool-call';
import { GeneratedFile } from './generated-file';
import { isApprovalNeeded } from './is-approval-needed';
import { parseToolCall } from './parse-tool-call';
import {
  StreamTextOnToolCallFinishCallback,
  StreamTextOnToolCallStartCallback,
} from './stream-text';
import { ToolApprovalRequestOutput } from './tool-approval-request-output';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { TypedToolError } from './tool-error';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';

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
      text: string;
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
      text: string;
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
      dynamic?: boolean;
      title?: string;
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
  | ToolApprovalRequestOutput<TOOLS>

  // Other types:
  | ({ type: 'source' } & Source)
  | { type: 'file'; file: GeneratedFile; providerMetadata?: ProviderMetadata }
  | {
      type: 'reasoning-file';
      file: GeneratedFile;
      providerMetadata?: ProviderMetadata;
    }
  | ({ type: 'tool-call' } & TypedToolCall<TOOLS>)
  | ({ type: 'tool-result' } & TypedToolResult<TOOLS>)
  | ({ type: 'tool-error' } & TypedToolError<TOOLS>)
  | { type: 'stream-start'; warnings: SharedV4Warning[] }
  | {
      type: 'response-metadata';
      id?: string;
      timestamp?: Date;
      modelId?: string;
    }
  | {
      type: 'finish';
      finishReason: FinishReason;
      rawFinishReason: string | undefined;
      usage: LanguageModelUsage;
      providerMetadata?: ProviderMetadata;
    }
  | { type: 'error'; error: unknown }
  | { type: 'raw'; rawValue: unknown };

export function runToolsTransformation<TOOLS extends ToolSet>({
  tools,
  generatorStream,
  telemetry,
  callId,
  system,
  messages,
  abortSignal,
  repairToolCall,
  toolTimeoutMs,
  experimental_context,
  generateId,
  stepNumber,
  model,
  onToolCallStart,
  onToolCallFinish,
  executeToolInTelemetryContext,
}: {
  tools: TOOLS | undefined;
  generatorStream: ReadableStream<UglyTransformedStreamTextPart>;
  telemetry: TelemetrySettings | undefined;
  callId: string;
  system: string | SystemModelMessage | Array<SystemModelMessage> | undefined;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
  toolTimeoutMs?: number | undefined;
  experimental_context: unknown;
  generateId: IdGenerator;
  stepNumber?: number;
  model?: { provider: string; modelId: string };
  onToolCallStart?:
    | StreamTextOnToolCallStartCallback<TOOLS>
    | Array<StreamTextOnToolCallStartCallback<TOOLS> | undefined | null>;
  onToolCallFinish?:
    | StreamTextOnToolCallFinishCallback<TOOLS>
    | Array<StreamTextOnToolCallFinishCallback<TOOLS> | undefined | null>;
  executeToolInTelemetryContext?: TelemetryIntegration['executeTool'];
}): ReadableStream<SingleRequestTextStreamPart<TOOLS>> {
  // there is a separate stream for tool results, because
  // tool results might be emitted after the generator stream has finished
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

  // keep track of parsed tool calls so provider-emitted approval requests can reference them
  // keep track of tool inputs for provider-side tool results
  const toolCallsByToolCallId = new Map<string, TypedToolCall<TOOLS>>();

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
    UglyTransformedStreamTextPart,
    SingleRequestTextStreamPart<TOOLS>
  >({
    async transform(
      chunk: UglyTransformedStreamTextPart,
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
        case 'file':
        case 'reasoning-file':
        case 'source':
        case 'response-metadata':
        case 'error':
        case 'raw': {
          controller.enqueue(chunk);
          break;
        }

        case 'finish': {
          finishChunk = {
            type: 'finish',
            finishReason: chunk.finishReason.unified,
            rawFinishReason: chunk.finishReason.raw,
            usage: asLanguageModelUsage(chunk.usage),
            providerMetadata: chunk.providerMetadata,
          };
          break;
        }

        case 'tool-approval-request': {
          const toolCall = toolCallsByToolCallId.get(chunk.toolCallId);
          if (toolCall == null) {
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: new ToolCallNotFoundForApprovalError({
                toolCallId: chunk.toolCallId,
                approvalId: chunk.approvalId,
              }),
            });
            break;
          }

          controller.enqueue({
            type: 'tool-approval-request',
            approvalId: chunk.approvalId,
            toolCall,
          });
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

            toolCallsByToolCallId.set(toolCall.toolCallId, toolCall);
            controller.enqueue(toolCall);

            if (toolCall.invalid) {
              toolResultsStreamController!.enqueue({
                type: 'tool-error',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
                error: getErrorMessage(toolCall.error!),
                dynamic: true,
                title: toolCall.title,
              });
              break;
            }

            const tool = tools?.[toolCall.toolName];

            if (tool == null) {
              // ignore tool calls for tools that are not available,
              // e.g. provider-executed dynamic tools
              break;
            }

            if (tool.onInputAvailable != null) {
              await tool.onInputAvailable({
                input: toolCall.input,
                toolCallId: toolCall.toolCallId,
                messages,
                abortSignal,
                experimental_context,
              });
            }

            if (
              await isApprovalNeeded({
                tool,
                toolCall,
                messages,
                experimental_context,
              })
            ) {
              toolResultsStreamController!.enqueue({
                type: 'tool-approval-request',
                approvalId: generateId(),
                toolCall,
              });
              break;
            }

            // Only execute tools that are not provider-executed:
            if (tool.execute != null && toolCall.providerExecuted !== true) {
              const toolExecutionId = generateId(); // use our own id to guarantee uniqueness
              outstandingToolResults.add(toolExecutionId);

              // Note: we don't await the tool execution here (by leaving out 'await' on recordSpan),
              // because we want to process the next chunk as soon as possible.
              // This is important for the case where the tool execution takes a long time.
              executeToolCall({
                toolCall,
                tools,
                telemetry,
                callId,
                messages,
                abortSignal,
                toolTimeoutMs,
                experimental_context,
                stepNumber,
                model,
                onToolCallStart,
                onToolCallFinish,
                executeToolInTelemetryContext,
                onPreliminaryToolResult: result => {
                  toolResultsStreamController!.enqueue(result);
                },
              })
                .then(result => {
                  toolResultsStreamController!.enqueue(result);
                })
                .catch(error => {
                  toolResultsStreamController!.enqueue({
                    type: 'error',
                    error,
                  });
                })
                .finally(() => {
                  outstandingToolResults.delete(toolExecutionId);
                  attemptClose();
                });
            }
          } catch (error) {
            toolResultsStreamController!.enqueue({ type: 'error', error });
          }

          break;
        }

        case 'tool-result': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          controller.enqueue(
            chunk.isError
              ? ({
                  type: 'tool-error',
                  toolCallId: chunk.toolCallId,
                  toolName,
                  input: toolCallsByToolCallId.get(chunk.toolCallId)?.input,
                  providerExecuted: true,
                  error: chunk.result,
                  dynamic: chunk.dynamic,
                  ...(chunk.providerMetadata != null
                    ? { providerMetadata: chunk.providerMetadata }
                    : {}),
                } as TypedToolError<TOOLS>)
              : ({
                  type: 'tool-result',
                  toolCallId: chunk.toolCallId,
                  toolName,
                  input: toolCallsByToolCallId.get(chunk.toolCallId)?.input,
                  output: chunk.result,
                  providerExecuted: true,
                  dynamic: chunk.dynamic,
                  ...(chunk.providerMetadata != null
                    ? { providerMetadata: chunk.providerMetadata }
                    : {}),
                } as TypedToolResult<TOOLS>),
          );

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
