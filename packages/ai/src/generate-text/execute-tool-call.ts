import type {
  Arrayable,
  InferToolContext,
  InferToolInput,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import {
  executeTool,
  isExecutableTool,
  ModelMessage,
} from '@ai-sdk/provider-utils';
import {
  getToolTimeoutMs,
  TimeoutConfiguration,
} from '../prompt/request-options';
import { TelemetryOptions } from '../telemetry/telemetry-options';
import { mergeAbortSignals } from '../util/merge-abort-signals';
import { notify } from '../util/notify';
import { now } from '../util/now';
import { TypedToolCall } from './tool-call';
import { TypedToolError } from './tool-error';
import {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from './tool-execution-events';
import { ToolOutput } from './tool-output';
import { TypedToolResult } from './tool-result';

/**
 * Executes a single tool call and manages its lifecycle callbacks.
 *
 * This function handles the complete tool execution flow:
 * 1. Invokes `onToolExecutionStart` callback before execution
 * 2. Executes the tool's `execute` function with proper context
 * 3. Handles streaming outputs via `onPreliminaryToolResult`
 * 4. Invokes `onToolExecutionEnd` callback with success or error result
 *
 * @returns The tool output (result or error), or undefined if the tool has no execute function.
 */
export async function executeToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  toolsContext,
  telemetry,
  callId,
  messages,
  abortSignal,
  timeout,
  stepNumber,
  provider,
  modelId,
  onPreliminaryToolResult,
  onToolExecutionStart,
  onToolExecutionEnd,
  executeToolInTelemetryContext = async ({ execute }) => execute(),
}: {
  toolCall: TypedToolCall<TOOLS>;
  tools: TOOLS | undefined;
  telemetry: TelemetryOptions | undefined;
  callId: string;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  toolsContext: InferToolSetContext<TOOLS>;
  timeout?: TimeoutConfiguration<TOOLS>;
  stepNumber?: number;
  provider?: string;
  modelId?: string;
  onPreliminaryToolResult?: (result: TypedToolResult<TOOLS>) => void;
  onToolExecutionStart?: Arrayable<OnToolExecutionStartCallback<TOOLS>>;
  onToolExecutionEnd?: Arrayable<OnToolExecutionEndCallback<TOOLS>>;
  executeToolInTelemetryContext?: <T>(params: {
    callId: string;
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }) => PromiseLike<T>;
}): Promise<ToolOutput<TOOLS> | undefined> {
  const { toolName, toolCallId, input } = toolCall;
  const tool = tools?.[toolName];

  if (!isExecutableTool(tool)) {
    return undefined;
  }

  // TODO validate the context type against the tool context schema
  const context: InferToolContext<typeof tool> =
    toolsContext?.[toolName as keyof typeof toolsContext];

  const baseCallbackEvent = {
    callId,
    stepNumber,
    provider,
    modelId,
    toolCall,
    messages,
    functionId: telemetry?.functionId,
    context, // TODO rename to toolContext
  };

  let output: unknown;

  await notify({ event: baseCallbackEvent, callbacks: onToolExecutionStart });

  const toolTimeoutMs = getToolTimeoutMs<TOOLS>(timeout, toolName);
  const toolAbortSignal = mergeAbortSignals(abortSignal, toolTimeoutMs);

  const startTime = now();

  try {
    // In order to correctly nest telemetry spans within tool calls spans, telemetry integrations need
    // to be able to execute the tool call in a telemetry-integration-specific context.
    //
    // The call id and the tool call id are provided to the telemetry integration so that it can correctly
    // identify the parent span.
    await executeToolInTelemetryContext({
      callId,
      toolCallId,
      execute: async () => {
        const stream = executeTool({
          tool,
          input: input as InferToolInput<typeof tool>,
          options: {
            toolCallId,
            messages,
            abortSignal: toolAbortSignal,
            context,
          },
        });

        for await (const part of stream) {
          if (part.type === 'preliminary') {
            onPreliminaryToolResult?.({
              ...toolCall,
              type: 'tool-result',
              output: part.output,
              preliminary: true,
            });
          } else {
            output = part.output;
          }
        }
      },
    });
  } catch (error) {
    const durationMs = now() - startTime;

    await notify({
      event: {
        ...baseCallbackEvent,
        success: false as const,
        error,
        durationMs,
      },
      callbacks: onToolExecutionEnd,
    });

    return {
      type: 'tool-error',
      toolCallId,
      toolName,
      input,
      error,
      dynamic: tool.type === 'dynamic',
      ...(toolCall.providerMetadata != null
        ? { providerMetadata: toolCall.providerMetadata }
        : {}),
    } as TypedToolError<TOOLS>;
  }

  const durationMs = now() - startTime;

  await notify({
    event: {
      ...baseCallbackEvent,
      success: true as const,
      output,
      durationMs,
    },
    callbacks: onToolExecutionEnd,
  });

  return {
    type: 'tool-result',
    toolCallId,
    toolName,
    input,
    output,
    dynamic: tool.type === 'dynamic',
    ...(toolCall.providerMetadata != null
      ? { providerMetadata: toolCall.providerMetadata }
      : {}),
  } as TypedToolResult<TOOLS>;
}
