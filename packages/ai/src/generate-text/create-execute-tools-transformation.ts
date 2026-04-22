import type {
  Arrayable,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { IdGenerator, ModelMessage } from '@ai-sdk/provider-utils';
import { TimeoutConfiguration } from '../prompt/request-options';
import type { Telemetry } from '../telemetry/telemetry';
import type { Callback } from '../util/callback';
import { notify } from '../util/notify';
import type { ModelCallEndEvent } from './language-model-events';
import { executeToolCall } from './execute-tool-call';
import type { GeneratedFile } from './generated-file';
import { resolveToolApproval } from './resolve-tool-approval';
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
  provider,
  modelId,
  onModelCallEnd,
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
  provider?: string;
  modelId?: string;
  onModelCallEnd?: Arrayable<Callback<ModelCallEndEvent<TOOLS>>>;
  onToolExecutionStart?: Arrayable<OnToolExecutionStartCallback<TOOLS>>;
  onToolExecutionEnd?: Arrayable<OnToolExecutionEndCallback<TOOLS>>;
  executeToolInTelemetryContext?: Telemetry['executeTool'];
}): TransformStream<
  LanguageModelStreamPart<TOOLS>,
  LanguageModelStreamPart<TOOLS>
> {
  const toolCallsToExecute: Array<TypedToolCall<TOOLS>> = [];
  const modelToolCalls: Array<TypedToolCall<TOOLS>> = [];
  const modelFiles: Array<GeneratedFile> = [];
  const modelReasoning: Array<{ text?: string }> = [];
  let modelText = '';
  let responseModelId = modelId ?? '';
  let responseId = '';

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
            return;
          }

          modelToolCalls.push(chunk);

          const tool = tools?.[chunk.toolName];

          if (tool == null) {
            // ignore tool calls for tools that are not available,
            // e.g. provider-executed dynamic tools
            return;
          }

          const toolApprovalStatus = await resolveToolApproval({
            tools,
            toolCall: chunk,
            toolApproval,
            messages,
            toolsContext,
          });

          switch (toolApprovalStatus.type) {
            case 'user-approval': {
              controller.enqueue({
                type: 'tool-approval-request',
                approvalId: generateId(),
                toolCall: chunk,
              });

              return; // don't execute tool
            }

            case 'denied': {
              const approvalId = generateId();

              controller.enqueue({
                type: 'tool-approval-request',
                approvalId,
                toolCall: chunk,
                isAutomatic: true,
              });
              controller.enqueue({
                type: 'tool-approval-response',
                approvalId,
                approved: false,
                toolCall: chunk,
                reason: toolApprovalStatus.reason,
                providerExecuted: chunk.providerExecuted,
              });

              return; // don't execute tool
            }

            case 'approved': {
              const approvalId = generateId();

              controller.enqueue({
                type: 'tool-approval-request',
                approvalId,
                toolCall: chunk,
                isAutomatic: true,
              });
              controller.enqueue({
                type: 'tool-approval-response',
                approvalId,
                approved: true,
                toolCall: chunk,
                reason: toolApprovalStatus.reason,
                providerExecuted: chunk.providerExecuted,
              });

              break; // continue with tool execution
            }

            case 'not-applicable':
              break; // continue with tool execution
          }

          // Only execute tools that are not provider-executed:
          if (tool.execute != null && chunk.providerExecuted !== true) {
            toolCallsToExecute.push(chunk);
          }

          return;
        }

        case 'text-delta': {
          modelText += chunk.text;
          break;
        }

        case 'reasoning-start': {
          modelReasoning.push({ text: '' });
          break;
        }

        case 'reasoning-delta': {
          const lastReasoning = modelReasoning.at(-1);
          if (lastReasoning == null) {
            modelReasoning.push({ text: chunk.text });
          } else {
            lastReasoning.text = `${lastReasoning.text ?? ''}${chunk.text}`;
          }
          break;
        }

        case 'file': {
          modelFiles.push(chunk.file);
          break;
        }

        case 'model-call-response-metadata': {
          responseModelId = chunk.modelId ?? responseModelId;
          responseId = chunk.id ?? responseId;
          break;
        }

        case 'model-call-end': {
          await notify({
            event: {
              callId,
              provider: provider ?? '',
              modelId: modelId ?? responseModelId,
              finishReason: chunk.finishReason,
              usage: chunk.usage,
              text: modelText,
              reasoning: modelReasoning,
              files: modelFiles,
              toolCalls: modelToolCalls,
              responseId,
            },
            callbacks: onModelCallEnd,
          });

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

          return;
        }
      }
    },
  });
}
