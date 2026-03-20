import { IdGenerator, ModelMessage } from '@ai-sdk/provider-utils';
import { TimeoutConfiguration } from '../prompt/call-settings';
import type { TelemetryIntegration } from '../telemetry/telemetry-integration';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { UglyTransformedStreamTextPart } from './create-stream-text-part-transform';
import { executeToolCall } from './execute-tool-call';
import { isApprovalNeeded } from './is-approval-needed';
import {
  OnToolCallFinishCallback,
  OnToolCallStartCallback,
} from './core-events';
import { ToolSet } from './tool-set';
import { TypedToolCall } from './tool-call';

export function createExecuteToolsTransformation<TOOLS extends ToolSet>({
  tools,
  telemetry,
  callId,
  messages,
  abortSignal,
  timeout,
  experimental_context,
  generateId,
  stepNumber,
  provider,
  modelId,
  onToolCallStart,
  onToolCallFinish,
  executeToolInTelemetryContext,
}: {
  tools: TOOLS | undefined;
  telemetry: TelemetrySettings | undefined;
  callId: string;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  timeout?: TimeoutConfiguration<TOOLS>;
  experimental_context: unknown;
  generateId: IdGenerator;
  stepNumber?: number;
  provider?: string;
  modelId?: string;
  onToolCallStart?:
    | OnToolCallStartCallback<TOOLS>
    | Array<OnToolCallStartCallback<TOOLS> | undefined | null>;
  onToolCallFinish?:
    | OnToolCallFinishCallback<TOOLS>
    | Array<OnToolCallFinishCallback<TOOLS> | undefined | null>;
  executeToolInTelemetryContext?: TelemetryIntegration['executeTool'];
}): TransformStream<
  UglyTransformedStreamTextPart<TOOLS>,
  UglyTransformedStreamTextPart<TOOLS>
> {
  const toolCallsToExecute: Array<TypedToolCall<TOOLS>> = [];

  // forward stream
  return new TransformStream<
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
          await Promise.all(
            toolCallsToExecute.map(async toolCall => {
              try {
                // Note: we don't await the tool execution here (by leaving out 'await' on recordSpan),
                // because we want to process the next chunk as soon as possible.
                // This is important for the case where the tool execution takes a long time.
                const result = await executeToolCall({
                  toolCall,
                  tools,
                  telemetry,
                  callId,
                  messages,
                  abortSignal,
                  timeout,
                  experimental_context,
                  stepNumber,
                  provider,
                  modelId,
                  onToolCallStart,
                  onToolCallFinish,
                  executeToolInTelemetryContext,
                  onPreliminaryToolResult: result => {
                    controller.enqueue(result);
                  },
                });
                controller.enqueue(result);
              } catch (error) {
                controller.enqueue({
                  type: 'error',
                  error,
                });
              }
            }),
          );

          // the finish chunk is delayed until all tool results are received
          controller.enqueue(chunk);

          break;
        }

        // process tool call:
        case 'tool-call': {
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
            controller.enqueue({
              type: 'tool-approval-request',
              approvalId: generateId(),
              toolCall: chunk,
            });
            break;
          }

          // Only execute tools that are not provider-executed:
          if (tool.execute != null && chunk.providerExecuted !== true) {
            toolCallsToExecute.push(chunk);
          }

          break;
        }

        default: {
          // forward all other chunks
          controller.enqueue(chunk);
        }
      }
    },
  });
}
