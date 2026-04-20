import type {
  Arrayable,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { IdGenerator, ModelMessage } from '@ai-sdk/provider-utils';
import { TimeoutConfiguration } from '../prompt/request-options';
import type { Telemetry } from '../telemetry/telemetry';
import { TelemetryOptions } from '../telemetry/telemetry-options';
import type { Callback } from '../util/callback';
import { notify } from '../util/notify';
import type { ModelCallEndEvent } from './core-events';
import { executeToolCall } from './execute-tool-call';
import type { GeneratedFile } from './generated-file';
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
  telemetry,
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
  onModelCallEnd,
  onToolExecutionStart,
  onToolExecutionEnd,
  executeToolInTelemetryContext,
}: {
  tools: TOOLS | undefined;
  telemetry: TelemetryOptions | undefined;
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

          modelToolCalls.push(chunk);

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
                  telemetry,
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
