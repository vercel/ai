import type {
  Context,
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { createTelemetryDispatcher } from 'ai/internal';
import type {
  ContentPart,
  GenerateTextOnEndCallback,
  GenerateTextOnStartCallback,
  GenerateTextOnStepEndCallback,
  GenerateTextOnStepStartCallback,
  LanguageModelUsage,
  OnLanguageModelCallEndCallback,
  OnLanguageModelCallStartCallback,
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
  OutputInterface as Output,
  StepResult,
  TelemetryOptions,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  TypedToolCall,
  TypedToolError,
  TypedToolResult,
} from 'ai';
import type { HarnessV1ToolSpec } from '../../v1';

export type HarnessAgentLifecycleCallbacks<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> = {
  onStart?: GenerateTextOnStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  onStepStart?: GenerateTextOnStepStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  onLanguageModelCallStart?: OnLanguageModelCallStartCallback;
  onLanguageModelCallEnd?: OnLanguageModelCallEndCallback<TOOLS>;
  onToolExecutionStart?: OnToolExecutionStartCallback<TOOLS>;
  onToolExecutionEnd?: OnToolExecutionEndCallback<TOOLS>;
  onStepEnd?: GenerateTextOnStepEndCallback<TOOLS, RUNTIME_CONTEXT>;
  onEnd?: GenerateTextOnEndCallback<TOOLS, RUNTIME_CONTEXT>;
};

type Dispatcher = ReturnType<typeof createTelemetryDispatcher>;

export interface TurnLifecycle<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
> {
  start(modelId?: string): Promise<void>;
  ensureStepOpen(): Promise<void>;
  languageModelCallEnd(input: {
    finishReason: StepResult<TOOLS, RUNTIME_CONTEXT>['finishReason'];
    usage: LanguageModelUsage;
    content: ContentPart<TOOLS>[];
    providerMetadata: StepResult<TOOLS, RUNTIME_CONTEXT>['providerMetadata'];
  }): Promise<void>;
  toolExecutionStart(input: { toolCall: TypedToolCall<TOOLS> }): Promise<void>;
  toolExecutionEnd(input: {
    toolCall: TypedToolCall<TOOLS>;
    toolOutput: TypedToolResult<TOOLS> | TypedToolError<TOOLS>;
    toolExecutionMs: number;
  }): Promise<void>;
  stepEnd(step: StepResult<TOOLS, RUNTIME_CONTEXT>): Promise<void>;
  end(input: {
    steps: StepResult<TOOLS, RUNTIME_CONTEXT>[];
    usage: LanguageModelUsage;
  }): Promise<void>;
  executeTool<T>(input: {
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }): Promise<T>;
  error(error: unknown): Promise<void>;
}

async function notify<EVENT>(
  event: EVENT,
  ...callbacks: Array<((event: EVENT) => unknown) | undefined>
): Promise<void> {
  await Promise.allSettled(
    callbacks.map(async callback => {
      await callback?.(event);
    }),
  );
}

export function createTurnLifecycle<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
>(options: {
  callId: string;
  telemetry: TelemetryOptions | undefined;
  callbacks: HarnessAgentLifecycleCallbacks<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  harnessId: string;
  modelId: string | undefined;
  instructions: string | undefined;
  tools: TOOLS;
  toolsContext: InferToolSetContext<TOOLS>;
  activeToolNames: string[];
  toolSpecs: HarnessV1ToolSpec[];
  messages: ModelMessage[];
  runtimeContext: RUNTIME_CONTEXT;
  output: OUTPUT | undefined;
}): TurnLifecycle<TOOLS, RUNTIME_CONTEXT> {
  const telemetry =
    options.telemetry == null
      ? ({} as Dispatcher)
      : createTelemetryDispatcher({ telemetry: options.telemetry });
  const provider = `harness:${options.harnessId}`;
  let modelId = options.modelId ?? '';
  let started = false;
  let stepOpen = false;
  let stepNumber = 0;
  let ended = false;
  let modelCallStartedAt = 0;
  const completedSteps: StepResult<TOOLS, RUNTIME_CONTEXT>[] = [];
  const languageModelTools =
    options.toolSpecs.length === 0
      ? undefined
      : options.toolSpecs.map(tool => ({
          type: 'function' as const,
          name: tool.name,
          ...(tool.description == null
            ? {}
            : { description: tool.description }),
          ...(tool.inputSchema == null
            ? {}
            : { inputSchema: tool.inputSchema }),
        }));

  const start = async (overrideModelId?: string): Promise<void> => {
    if (started) return;
    if (overrideModelId != null) modelId = overrideModelId;
    started = true;
    const event = {
      callId: options.callId,
      operationId: 'ai.harness',
      provider,
      modelId,
      tools: options.tools,
      toolChoice: undefined,
      activeTools: options.activeToolNames,
      toolOrder: [],
      maxRetries: 0,
      timeout: undefined,
      headers: undefined,
      providerOptions: undefined,
      output: options.output,
      toolsContext: options.toolsContext,
      runtimeContext: options.runtimeContext,
      instructions: options.instructions,
      messages: options.messages,
    };
    await notify(
      event,
      options.callbacks.onStart,
      telemetry.onStart as typeof options.callbacks.onStart,
    );
  };

  const ensureStepOpen = async (): Promise<void> => {
    if (!started) await start();
    if (stepOpen || ended) return;
    stepOpen = true;
    const stepStartEvent = {
      callId: options.callId,
      provider,
      modelId,
      stepNumber,
      tools: options.tools,
      toolChoice: undefined,
      activeTools: options.activeToolNames,
      toolOrder: [],
      steps: [...completedSteps],
      providerOptions: undefined,
      output: options.output,
      runtimeContext: options.runtimeContext,
      toolsContext: options.toolsContext,
      instructions: options.instructions,
      messages: options.messages,
    };
    await notify(
      stepStartEvent,
      options.callbacks.onStepStart,
      telemetry.onStepStart as typeof options.callbacks.onStepStart,
    );

    const modelStartEvent = {
      callId: options.callId,
      provider,
      modelId,
      instructions: options.instructions,
      messages: options.messages,
      tools: languageModelTools,
    };
    modelCallStartedAt = Date.now();
    await notify(
      modelStartEvent,
      options.callbacks.onLanguageModelCallStart,
      telemetry.onLanguageModelCallStart as typeof options.callbacks.onLanguageModelCallStart,
    );
  };

  return {
    start,
    ensureStepOpen,

    async languageModelCallEnd(input) {
      await ensureStepOpen();
      const event = {
        callId: options.callId,
        provider,
        modelId,
        finishReason: input.finishReason,
        usage: input.usage,
        content: input.content,
        responseId: `${options.callId}-${stepNumber}`,
        providerMetadata: input.providerMetadata,
        performance: {
          responseTimeMs: Math.max(0, Date.now() - modelCallStartedAt),
          effectiveOutputTokensPerSecond: 0,
          outputTokensPerSecond: undefined,
          inputTokensPerSecond: undefined,
          effectiveTotalTokensPerSecond: 0,
          timeToFirstOutputMs: undefined,
          timeBetweenOutputChunksMs: undefined,
        },
      };
      await notify(
        event,
        options.callbacks.onLanguageModelCallEnd,
        telemetry.onLanguageModelCallEnd as typeof options.callbacks.onLanguageModelCallEnd,
      );
    },

    async toolExecutionStart({ toolCall }) {
      const event = {
        callId: options.callId,
        messages: options.messages,
        toolCall,
        toolContext: undefined,
      } as ToolExecutionStartEvent<TOOLS>;
      await notify(
        event,
        options.callbacks.onToolExecutionStart,
        telemetry.onToolExecutionStart as typeof options.callbacks.onToolExecutionStart,
      );
    },

    async toolExecutionEnd({ toolCall, toolOutput, toolExecutionMs }) {
      const event = {
        callId: options.callId,
        messages: options.messages,
        toolCall,
        toolContext: undefined,
        toolOutput,
        toolExecutionMs,
      } as ToolExecutionEndEvent<TOOLS>;
      await notify(
        event,
        options.callbacks.onToolExecutionEnd,
        telemetry.onToolExecutionEnd as typeof options.callbacks.onToolExecutionEnd,
      );
    },

    async stepEnd(step) {
      if (!stepOpen) return;
      completedSteps.push(step);
      const telemetryStepEndEvent = Object.assign(Object.create(null), {
        callId: step.callId,
        stepNumber: step.stepNumber,
        model: step.model,
        toolsContext: step.toolsContext,
        runtimeContext: step.runtimeContext,
        content: step.content,
        finishReason: step.finishReason,
        rawFinishReason: step.rawFinishReason,
        usage: step.usage,
        performance: step.performance,
        warnings: step.warnings,
        request: step.request,
        response: step.response,
        providerMetadata: step.providerMetadata,
        text: step.text,
        reasoning: step.reasoning,
        reasoningText: step.reasoningText,
        files: step.files,
        sources: step.sources,
        toolCalls: step.toolCalls,
        staticToolCalls: step.staticToolCalls,
        dynamicToolCalls: step.dynamicToolCalls,
        toolResults: step.toolResults,
        staticToolResults: step.staticToolResults,
        dynamicToolResults: step.dynamicToolResults,
      });
      await Promise.allSettled([
        options.callbacks.onStepEnd?.(step),
        telemetry.onStepEnd?.(telemetryStepEndEvent),
      ]);
      stepOpen = false;
      stepNumber += 1;
    },

    async end({ steps, usage }) {
      if (!started) await start();
      if (ended || steps.length === 0) return;
      ended = true;
      const finalStep = steps[steps.length - 1]!;
      const event = {
        callId: options.callId,
        stepNumber: finalStep.stepNumber,
        model: finalStep.model,
        toolsContext: finalStep.toolsContext,
        runtimeContext: finalStep.runtimeContext,
        content: steps.flatMap(step => step.content),
        text: finalStep.text,
        reasoning: finalStep.reasoning,
        reasoningText: finalStep.reasoningText,
        files: steps.flatMap(step => step.files),
        sources: steps.flatMap(step => step.sources),
        toolCalls: steps.flatMap(step => step.toolCalls),
        staticToolCalls: steps.flatMap(step => step.staticToolCalls),
        dynamicToolCalls: steps.flatMap(step => step.dynamicToolCalls),
        toolResults: steps.flatMap(step => step.toolResults),
        staticToolResults: steps.flatMap(step => step.staticToolResults),
        dynamicToolResults: steps.flatMap(step => step.dynamicToolResults),
        finishReason: finalStep.finishReason,
        rawFinishReason: finalStep.rawFinishReason,
        usage,
        totalUsage: usage,
        warnings: steps.flatMap(step => step.warnings ?? []),
        request: finalStep.request,
        response: finalStep.response,
        providerMetadata: finalStep.providerMetadata,
        responseMessages: steps.flatMap(step => step.response.messages),
        steps,
        finalStep,
      };
      await notify(
        event,
        options.callbacks.onEnd,
        telemetry.onEnd as typeof options.callbacks.onEnd,
      );
    },

    async executeTool({ toolCallId, execute }) {
      if (telemetry.executeTool == null) return await execute();
      return await telemetry.executeTool({
        callId: options.callId,
        toolCallId,
        execute,
      });
    },

    async error(error) {
      if (ended) return;
      if (!started) await start();
      ended = true;
      await telemetry.onError?.(error);
    },
  };
}
