import type {
  Context,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { executeTool, ModelMessage } from '@ai-sdk/provider-utils';
import {
  getToolTimeoutMs,
  TimeoutConfiguration,
} from '../prompt/request-options';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { notify } from '../util/notify';
import { now } from '../util/now';
import {
  GenerateTextOnToolCallFinishCallback,
  GenerateTextOnToolCallStartCallback,
} from './generate-text';
import { TypedToolCall } from './tool-call';
import { TypedToolError } from './tool-error';
import { ToolOutput } from './tool-output';
import { TypedToolResult } from './tool-result';

/**
 * Executes a single tool call and manages its lifecycle callbacks.
 *
 * This function handles the complete tool execution flow:
 * 1. Invokes `onToolCallStart` callback before execution
 * 2. Executes the tool's `execute` function with proper context
 * 3. Handles streaming outputs via `onPreliminaryToolResult`
 * 4. Invokes `onToolCallFinish` callback with success or error result
 *
 * @returns The tool output (result or error), or undefined if the tool has no execute function.
 */
export async function executeToolCall<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>({
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
  onPreliminaryToolResult,
  onToolCallStart,
  onToolCallFinish,
  executeToolInTelemetryContext = async ({ execute }) => execute(),
}: {
  toolCall: TypedToolCall<TOOLS>;
  tools: TOOLS | undefined;
  telemetry: TelemetrySettings | undefined;
  callId: string;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  context: InferToolSetContext<TOOLS> & USER_CONTEXT;
  timeout?: TimeoutConfiguration<TOOLS>;
  stepNumber?: number;
  provider?: string;
  modelId?: string;
  onPreliminaryToolResult?: (result: TypedToolResult<TOOLS>) => void;
  onToolCallStart?:
    | GenerateTextOnToolCallStartCallback<TOOLS>
    | Array<GenerateTextOnToolCallStartCallback<TOOLS> | undefined | null>;
  onToolCallFinish?:
    | GenerateTextOnToolCallFinishCallback<TOOLS>
    | Array<GenerateTextOnToolCallFinishCallback<TOOLS> | undefined | null>;
  executeToolInTelemetryContext?: <T>(params: {
    callId: string;
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }) => PromiseLike<T>;
}): Promise<ToolOutput<TOOLS> | undefined> {
  const { toolName, toolCallId, input } = toolCall;
  const tool = tools?.[toolName];

  if (tool?.execute == null) {
    return undefined;
  }

  const baseCallbackEvent = {
    callId,
    stepNumber,
    provider,
    modelId,
    toolCall,
    messages,
    abortSignal,
    functionId: telemetry?.functionId,
    context,
  };

  let output: unknown;

  await notify({ event: baseCallbackEvent, callbacks: onToolCallStart });

  const toolTimeoutMs = getToolTimeoutMs<TOOLS>(timeout, toolName);

  const toolAbortSignal =
    toolTimeoutMs != null
      ? abortSignal != null
        ? AbortSignal.any([abortSignal, AbortSignal.timeout(toolTimeoutMs)])
        : AbortSignal.timeout(toolTimeoutMs)
      : abortSignal;

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
          execute: tool.execute!.bind(tool),
          input,
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
      callbacks: onToolCallFinish,
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
    callbacks: onToolCallFinish,
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
