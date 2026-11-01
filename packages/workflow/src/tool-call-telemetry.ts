import { createIdGenerator } from '@ai-sdk/provider-utils';
import type { ModelMessage } from 'ai';
import {
  createNullLanguageModelUsage,
  createTelemetryDispatcher,
} from 'ai/internal';
import type { ModelCallTelemetry } from './model-call.js';

const generateCallId = createIdGenerator({ prefix: 'call', size: 24 });

export type SerializedToolError =
  | {
      isErrorInstance: true;
      name: string;
      message: string;
      stack?: string;
    }
  | {
      isErrorInstance: false;
      value: unknown;
    };

export function serializeToolError(error: unknown): SerializedToolError {
  if (error instanceof Error) {
    return {
      isErrorInstance: true,
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  try {
    if (typeof error === 'object' && error !== null) {
      return {
        isErrorInstance: false,
        value: JSON.parse(JSON.stringify(error)),
      };
    }
    return {
      isErrorInstance: false,
      value: error,
    };
  } catch {
    return {
      isErrorInstance: false,
      value: String(error),
    };
  }
}

export function deserializeToolError(serialized: SerializedToolError): unknown {
  if (serialized.isErrorInstance) {
    const err = new Error(serialized.message);
    err.name = serialized.name;
    if (serialized.stack !== undefined) {
      err.stack = serialized.stack;
    }
    return err;
  }
  return serialized.value;
}

export interface ToolCallTelemetryRecord {
  telemetry: ModelCallTelemetry;
  provider: string;
  modelId: string;
  toolCall: {
    type: 'tool-call';
    toolCallId: string;
    toolName: string;
    input: unknown;
  };
  toolContext: Record<string, unknown> | undefined;
  messages: ModelMessage[];
  toolExecutionMs: number;
  toolOutput:
    | {
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
      }
    | {
        type: 'tool-error';
        toolCallId: string;
        toolName: string;
        input: unknown;
        error: SerializedToolError;
      };
}

export async function dispatchToolCallTelemetryStep(
  record: ToolCallTelemetryRecord,
): Promise<void> {
  'use step';

  const { telemetry, provider, modelId, toolCall, toolContext, messages } =
    record;
  const dispatcher = createTelemetryDispatcher({ telemetry });
  const callId = generateCallId();
  const runtimeContext = telemetry.runtimeContext ?? {};
  const toolsContext =
    toolContext != null ? { [toolCall.toolName]: toolContext } : {};

  const resolvedToolOutput =
    record.toolOutput.type === 'tool-result'
      ? record.toolOutput
      : {
          ...record.toolOutput,
          error: deserializeToolError(record.toolOutput.error),
        };

  await dispatcher.onStart?.({
    callId,
    operationId: 'ai.workflowAgent.stream',
    provider,
    modelId,
    system: undefined,
    messages,
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    maxOutputTokens: undefined,
    temperature: undefined,
    topP: undefined,
    topK: undefined,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
    stopSequences: undefined,
    seed: undefined,
    maxRetries: 2,
    timeout: undefined,
    headers: undefined,
    reasoning: undefined,
    providerOptions: undefined,
    output: undefined,
    runtimeContext,
    toolsContext,
    recordInputs: telemetry.recordInputs,
    recordOutputs: telemetry.recordOutputs,
    functionId: telemetry.functionId,
  } as never);

  const startEvent = {
    callId,
    messages,
    toolCall: toolCall as any,
    toolContext,
  };

  const emitToolEvents = async () => {
    await dispatcher.onToolExecutionStart?.(startEvent as never);
    if (dispatcher.executeTool != null) {
      await dispatcher.executeTool({
        callId,
        toolCallId: toolCall.toolCallId,
        execute: async () => resolvedToolOutput,
      });
    }
    await dispatcher.onToolExecutionEnd?.({
      callId,
      messages,
      toolCall: toolCall as any,
      toolContext,
      toolExecutionMs: record.toolExecutionMs,
      toolOutput: resolvedToolOutput,
    } as never);
    return {
      output: resolvedToolOutput,
      toolExecutionMs: record.toolExecutionMs,
    };
  };

  if (dispatcher.runInTracingChannelSpan != null) {
    await dispatcher.runInTracingChannelSpan({
      type: 'executeTool',
      event: startEvent as never,
      execute: emitToolEvents,
    });
  } else {
    await emitToolEvents();
  }

  const nullUsage = createNullLanguageModelUsage();
  const toolResults =
    resolvedToolOutput.type === 'tool-result' ? [resolvedToolOutput] : [];
  const syntheticStep = {
    callId,
    stepNumber: telemetry.stepNumber,
    model: { provider, modelId },
    functionId: telemetry.functionId,
    content: [],
    text: '',
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: [toolCall],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults,
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: 'tool-calls' as const,
    rawFinishReason: 'tool-calls',
    usage: nullUsage,
    warnings: undefined,
    request: {},
    response: { id: '', timestamp: new Date(0), modelId, messages: [] },
    providerMetadata: undefined,
    experimental_context: runtimeContext,
    runtimeContext,
    toolsContext,
  };

  await dispatcher.onEnd?.({
    ...syntheticStep,
    steps: [syntheticStep],
    finalStep: syntheticStep,
    totalUsage: nullUsage,
    output: undefined,
  } as never);
}

dispatchToolCallTelemetryStep.maxRetries = 0;
