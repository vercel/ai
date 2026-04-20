import type { Arrayable, ToolSet } from '@ai-sdk/provider-utils';
import {
  IdGenerator,
  InferToolSetContext,
  ModelMessage,
} from '@ai-sdk/provider-utils';
import { TimeoutConfiguration } from '../prompt/request-options';
import type { Telemetry } from '../telemetry/telemetry';
import { executeToolCall } from './execute-tool-call';
import { isToolApprovalNeeded } from './is-tool-approval-needed';
import { LanguageModelStreamPart } from './stream-language-model-call';
import { ToolApprovalConfiguration } from './tool-approval-configuration';
import { TypedToolCall } from './tool-call';
import {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from './tool-execution-events';

export function createExecuteToolsTransformation<TOOLS extends ToolSet>({
  tools,
  callId,
  messages,
  abortSignal,
  timeout,
  toolsContext,
  toolApproval,
  generateId,
  stepNumber,
  provider,
  modelId,
  onToolExecutionStart,
  onToolExecutionEnd,
  executeToolInTelemetryContext,
}: {
  tools: TOOLS | undefined;
  callId: string;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  timeout?: TimeoutConfiguration<TOOLS>;
  toolsContext: InferToolSetContext<TOOLS>;
  toolApproval?: ToolApprovalConfiguration<TOOLS>;
  generateId: IdGenerator;
  stepNumber?: number;
  provider?: string;
  modelId?: string;
  onToolExecutionStart?: Arrayable<OnToolExecutionStartCallback<TOOLS>>;
  onToolExecutionEnd?: Arrayable<OnToolExecutionEndCallback<TOOLS>>;
  executeToolInTelemetryContext?: Telemetry['executeTool'];
}): TransformStream<
  LanguageModelStreamPart<TOOLS>,
  LanguageModelStreamPart<TOOLS>
> {
  const toolCallsToExecute: Array<TypedToolCall<TOOLS>> = [];

  // forward stream
  return new TransformStream<
    LanguageModelStreamPart<TOOLS>,
    LanguageModelStreamPart<TOOLS>
  >({
    async transform(
      chunk: LanguageModelStreamPart<TOOLS>,
      controller: TransformStreamDefaultController<
        LanguageModelStreamPart<TOOLS>
      >,
    ) {
      // immediately forward all chunks
      controller.enqueue(chunk);

      const chunkType = chunk.type;
      switch (chunkType) {
        case 'tool-call': {
          if (chunk.invalid) {
            break;
          }

          const tool = tools?.[chunk.toolName];

          if (tool == null) {
            // ignore tool calls for tools that are not available,
            // e.g. provider-executed dynamic tools
            break;
          }

          if (
            await isToolApprovalNeeded({
              tools,
              toolCall: chunk,
              toolApproval,
              messages,
              toolsContext,
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

        case 'model-call-end': {
          await Promise.all(
            toolCallsToExecute.map(async toolCall => {
              try {
                // Note: we don't await the tool execution here (by leaving out 'await' on recordSpan),
                // because we want to process the next chunk as soon as possible.
                // This is important for the case where the tool execution takes a long time.
                const result = await executeToolCall({
                  toolCall,
                  tools,
                  callId,
                  messages,
                  abortSignal,
                  timeout,
                  toolsContext,
                  stepNumber,
                  provider,
                  modelId,
                  onToolExecutionStart,
                  onToolExecutionEnd,
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

          break;
        }
      }
    },
  });
}
