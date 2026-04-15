import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import {
  IdGenerator,
  InferToolSetContext,
  ModelMessage,
} from '@ai-sdk/provider-utils';
import { TimeoutConfiguration } from '../prompt/request-options';
import type { TelemetryIntegration } from '../telemetry/telemetry-integration';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { executeToolCall } from './execute-tool-call';
import { isToolApprovalNeeded } from './is-tool-approval-needed';
import { LanguageModelStreamPart } from './stream-language-model-call';
import {
  StreamTextOnToolCallFinishCallback,
  StreamTextOnToolCallStartCallback,
} from './stream-text';
import { ToolNeedsApprovalConfiguration } from './tool-needs-approval-configuration';
import { TypedToolCall } from './tool-call';

export function createExecuteToolsTransformation<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>({
  tools,
  telemetry,
  callId,
  messages,
  abortSignal,
  timeout,
  context,
  toolNeedsApproval,
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
  context: InferToolSetContext<TOOLS> & USER_CONTEXT;
  toolNeedsApproval?: ToolNeedsApprovalConfiguration<TOOLS, USER_CONTEXT>;
  generateId: IdGenerator;
  stepNumber?: number;
  provider?: string;
  modelId?: string;
  onToolCallStart?:
    | StreamTextOnToolCallStartCallback<TOOLS>
    | Array<StreamTextOnToolCallStartCallback<TOOLS> | undefined | null>;
  onToolCallFinish?:
    | StreamTextOnToolCallFinishCallback<TOOLS>
    | Array<StreamTextOnToolCallFinishCallback<TOOLS> | undefined | null>;
  executeToolInTelemetryContext?: TelemetryIntegration['executeTool'];
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
              toolNeedsApproval,
              messages,
              context,
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
                  telemetry,
                  callId,
                  messages,
                  abortSignal,
                  timeout,
                  context,
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

          break;
        }
      }
    },
  });
}
