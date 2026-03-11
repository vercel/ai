import { executeTool, ModelMessage } from '@ai-sdk/provider-utils';
import { notify } from '../util/notify';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { now } from '../util/now';
import {
  GenerateTextOnToolCallFinishCallback,
  GenerateTextOnToolCallStartCallback,
} from './generate-text';
import { TypedToolCall } from './tool-call';
import { ToolOutput } from './tool-output';
import { ToolSet } from './tool-set';
import { TypedToolResult } from './tool-result';
import { TypedToolError } from './tool-error';

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
export async function executeToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  telemetry,
  callId,
  messages,
  abortSignal,
  experimental_context,
  stepNumber,
  model,
  onPreliminaryToolResult,
  onToolCallStart,
  onToolCallFinish,
  wrapToolExecution,
}: {
  toolCall: TypedToolCall<TOOLS>;
  tools: TOOLS | undefined;
  telemetry: TelemetrySettings | undefined;
  callId: string;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  experimental_context: unknown;
  stepNumber?: number;
  model?: { provider: string; modelId: string };
  onPreliminaryToolResult?: (result: TypedToolResult<TOOLS>) => void;
  onToolCallStart?:
    | GenerateTextOnToolCallStartCallback<TOOLS>
    | Array<GenerateTextOnToolCallStartCallback<TOOLS> | undefined | null>;
  onToolCallFinish?:
    | GenerateTextOnToolCallFinishCallback<TOOLS>
    | Array<GenerateTextOnToolCallFinishCallback<TOOLS> | undefined | null>;
  wrapToolExecution?: <T>(params: {
    callId: string;
    toolCallId: string;
    fn: () => Promise<T>;
  }) => Promise<T>;
}): Promise<ToolOutput<TOOLS> | undefined> {
  const { toolName, toolCallId, input } = toolCall;
  const tool = tools?.[toolName];

  if (tool?.execute == null) {
    return undefined;
  }

  const baseCallbackEvent = {
    callId,
    stepNumber,
    model,
    toolCall,
    messages,
    abortSignal,
    functionId: telemetry?.functionId,
    metadata: telemetry?.metadata as Record<string, unknown> | undefined,
    experimental_context,
  };

  let output: unknown;

  await notify({ event: baseCallbackEvent, callbacks: onToolCallStart });

  const startTime = now();

  try {
    const executeFn = async () => {
      const stream = executeTool({
        execute: tool.execute!.bind(tool),
        input,
        options: {
          toolCallId,
          messages,
          abortSignal,
          experimental_context,
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
    };

    if (wrapToolExecution) {
      await wrapToolExecution({ callId, toolCallId, fn: executeFn });
    } else {
      await executeFn();
    }
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
