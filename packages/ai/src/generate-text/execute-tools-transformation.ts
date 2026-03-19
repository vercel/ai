import { IdGenerator, ModelMessage } from '@ai-sdk/provider-utils';
import { TimeoutConfiguration } from '../prompt/call-settings';
import type { TelemetryIntegration } from '../telemetry/telemetry-integration';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { UglyTransformedStreamTextPart } from './create-stream-text-part-transform';
import { executeToolCall } from './execute-tool-call';
import { isApprovalNeeded } from './is-approval-needed';
import {
  StreamTextOnToolCallFinishCallback,
  StreamTextOnToolCallStartCallback,
} from './stream-text';
import { ToolSet } from './tool-set';

export function executeToolsTransformation<TOOLS extends ToolSet>({
  tools,
  generatorStream,
  telemetry,
  callId,
  messages,
  abortSignal,
  timeout,
  experimental_context,
  generateId,
  stepNumber,
  model,
  onToolCallStart,
  onToolCallFinish,
  executeToolInTelemetryContext,
}: {
  tools: TOOLS | undefined;
  generatorStream: ReadableStream<UglyTransformedStreamTextPart<TOOLS>>;
  telemetry: TelemetrySettings | undefined;
  callId: string;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  timeout?: TimeoutConfiguration<TOOLS>;
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
}): ReadableStream<UglyTransformedStreamTextPart<TOOLS>> {
  // there is a separate stream for tool results, because
  // tool results might be emitted after the generator stream has finished
  let toolResultsStreamController: ReadableStreamDefaultController<
    UglyTransformedStreamTextPart<TOOLS>
  > | null = null;
  const toolResultsStream = new ReadableStream<
    UglyTransformedStreamTextPart<TOOLS>
  >({
    start(controller) {
      toolResultsStreamController = controller;
    },
  });

  // keep track of outstanding tool results for stream closing:
  const outstandingToolResults = new Set<string>();

  let canClose = false;
  let finishChunk:
    | (UglyTransformedStreamTextPart<TOOLS> & { type: 'finish' })
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
    UglyTransformedStreamTextPart<TOOLS>,
    UglyTransformedStreamTextPart<TOOLS>
  >({
    async transform(
      chunk: UglyTransformedStreamTextPart<TOOLS>,
      controller: TransformStreamDefaultController<
        UglyTransformedStreamTextPart<TOOLS>
      >,
    ) {
      const chunkType = chunk.type;

      switch (chunkType) {
        case 'finish': {
          // the finish chunk is delayed until all tool results are received
          finishChunk = chunk;
          break;
        }

        // process tool call:
        case 'tool-call': {
          try {
            controller.enqueue(chunk);

            if (chunk.invalid) {
              break;
            }

            const tool = tools?.[chunk.toolName];

            if (tool == null) {
              // ignore tool calls for tools that are not available,
              // e.g. provider-executed dynamic tools
              break;
            }

            if (tool.onInputAvailable != null) {
              await tool.onInputAvailable({
                input: chunk.input,
                toolCallId: chunk.toolCallId,
                messages,
                abortSignal,
                experimental_context,
              });
            }

            if (
              await isApprovalNeeded({
                tool,
                toolCall: chunk,
                messages,
                experimental_context,
              })
            ) {
              toolResultsStreamController!.enqueue({
                type: 'tool-approval-request',
                approvalId: generateId(),
                toolCall: chunk,
              });
              break;
            }

            // Only execute tools that are not provider-executed:
            if (tool.execute != null && chunk.providerExecuted !== true) {
              const toolExecutionId = generateId(); // use our own id to guarantee uniqueness
              outstandingToolResults.add(toolExecutionId);

              // Note: we don't await the tool execution here (by leaving out 'await' on recordSpan),
              // because we want to process the next chunk as soon as possible.
              // This is important for the case where the tool execution takes a long time.
              executeToolCall({
                toolCall: chunk,
                tools,
                telemetry,
                callId,
                messages,
                abortSignal,
                timeout,
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

        default: {
          // forward all other chunks
          controller.enqueue(chunk);
        }
      }
    },

    flush() {
      canClose = true;
      attemptClose();
    },
  });

  // combine the generator stream and the tool results stream
  return new ReadableStream<UglyTransformedStreamTextPart<TOOLS>>({
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
