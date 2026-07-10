import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import type { Context } from '@ai-sdk/provider-utils';
import {
  experimental_filterActiveTools as filterActiveTools,
  DefaultGeneratedFile,
  type Experimental_LanguageModelStreamPart as ModelCallStreamPart,
  type Experimental_SandboxSession as SandboxSession,
  type Instructions,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type StepResult,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
} from 'ai';
import { createRestrictedTelemetryDispatcher } from 'ai/internal';
import {
  type DoStreamStepRawResult,
  doStreamStep,
  type ModelStopCondition,
  type ParsedToolCall,
  type ProviderExecutedToolResult,
  type StreamFinish,
} from './do-stream-step.js';
import { serializeToolSet } from './serializable-schema.js';
import type {
  GenerationSettings,
  PrepareStepCallback,
  WorkflowAgentOnErrorCallback,
  WorkflowAgentOnStepEndCallback,
  WorkflowAgentOnStepFinishCallback,
  TelemetryOptions,
  WorkflowAgentOnStepStartCallback,
} from './workflow-agent.js';

// Re-export for consumers
export type { ProviderExecutedToolResult } from './do-stream-step.js';

const prepareStepGenerationSettingKeys = [
  'maxOutputTokens',
  'temperature',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'stopSequences',
  'seed',
  'maxRetries',
  'headers',
  'reasoning',
  'providerOptions',
] as const satisfies readonly (keyof GenerationSettings)[];

function mergePrepareStepGenerationSettings(
  current: GenerationSettings,
  overrides: Partial<GenerationSettings>,
): GenerationSettings {
  const definedOverrides: Partial<GenerationSettings> = {};

  for (const key of prepareStepGenerationSettingKeys) {
    if (overrides[key] !== undefined) {
      Object.assign(definedOverrides, { [key]: overrides[key] });
    }
  }

  return { ...current, ...definedOverrides };
}

type WorkflowStepContentPart = StepResult<ToolSet, any>['content'][number];
type WorkflowReasoningContentPart = Extract<
  WorkflowStepContentPart,
  { type: 'reasoning' | 'reasoning-file' }
>;

/**
 * The value yielded by the stream text iterator when tool calls are requested.
 * Contains both the tool calls and the current conversation messages.
 */
export interface StreamTextIteratorYieldValue {
  /** The tool calls requested by the model (parsed with typed inputs) */
  toolCalls: ParsedToolCall[];
  /** The conversation messages up to (and including) the tool call request */
  messages: LanguageModelV4Prompt;
  /** The step result from the current step */
  step?: StepResult<ToolSet, any>;
  /** The current runtime context shared across the agent loop */
  runtimeContext?: Context;
  /** The current per-tool context, keyed by tool name */
  toolsContext?: Record<string, Context | undefined>;
  /** Provider-executed tool results (keyed by tool call ID) */
  providerExecutedToolResults?: Map<string, ProviderExecutedToolResult>;
  /** The sandbox selected for the current step. */
  experimental_sandbox?: SandboxSession;
}

// This runs in the workflow context
export async function* streamTextIterator({
  prompt,
  initialInstructions,
  initialMessages = prompt as unknown as ModelMessage[],
  tools = {},
  writable,
  model,
  stopConditions,
  onStepEnd,
  onStepFinish,
  onStepStart,
  onError,
  prepareStep,
  generationSettings,
  toolChoice,
  runtimeContext,
  toolsContext,
  telemetry,
  includeRawChunks = false,
  repairToolCall,
  responseFormat,
  experimental_sandbox: sandbox,
}: {
  prompt: LanguageModelV4Prompt;
  initialInstructions?: Instructions;
  initialMessages?: Array<ModelMessage>;
  tools: ToolSet;
  writable?: WritableStream<ModelCallStreamPart<ToolSet>>;
  model: LanguageModel;
  stopConditions?: ModelStopCondition[] | ModelStopCondition;
  onStepEnd?: WorkflowAgentOnStepEndCallback<any>;
  /** @deprecated Use `onStepEnd` instead. */
  onStepFinish?: WorkflowAgentOnStepFinishCallback<any>;
  onStepStart?: WorkflowAgentOnStepStartCallback;
  onError?: WorkflowAgentOnErrorCallback;
  prepareStep?: PrepareStepCallback<any>;
  generationSettings?: GenerationSettings;
  toolChoice?: ToolChoice<ToolSet>;
  runtimeContext?: Context;
  toolsContext?: Record<string, Context | undefined>;
  telemetry?: TelemetryOptions<Context, ToolSet>;
  includeRawChunks?: boolean;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
  experimental_sandbox?: SandboxSession;
}): AsyncGenerator<
  StreamTextIteratorYieldValue,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart[]
> {
  let conversationPrompt = [...prompt]; // Create a mutable copy
  let currentModel: LanguageModel = model;
  let currentGenerationSettings = generationSettings ?? {};
  let currentToolChoice = toolChoice;
  let currentRuntimeContext: Context = runtimeContext ?? {};
  let currentToolsContext: Record<string, Context | undefined> =
    toolsContext ?? {};
  let currentActiveTools: string[] | undefined;

  const steps: StepResult<any, any>[] = [];
  let done = false;
  let _isFirstIteration = true;
  let stepNumber = 0;
  let lastStep: StepResult<any, any> | undefined;
  let lastStepWasToolCalls = false;

  // TODO(#12164): replace this AI-core telemetry bridge with a
  // WorkflowAgent-specific typed dispatcher. `streamTextIterator` widens
  // tools/runtime context and emits Workflow-shaped events that are only
  // approximately compatible with generateText telemetry event types.
  const telemetryDispatcher = createRestrictedTelemetryDispatcher<
    any,
    any,
    any
  >({
    telemetry: telemetry as any,
    includeRuntimeContext: telemetry?.includeRuntimeContext,
    includeToolsContext: telemetry?.includeToolsContext,
  }) as any;

  while (!done) {
    // Check for abort signal
    if (currentGenerationSettings.abortSignal?.aborted) {
      break;
    }

    let stepSandbox = sandbox;

    // Call prepareStep callback before each step if provided
    if (prepareStep) {
      const prepareResult = await prepareStep({
        model: currentModel,
        initialInstructions,
        initialMessages,
        stepNumber,
        steps,
        messages: conversationPrompt,
        runtimeContext: currentRuntimeContext,
        toolsContext: currentToolsContext as never,
        experimental_sandbox: sandbox,
      });

      stepSandbox = prepareResult?.experimental_sandbox ?? sandbox;

      // Apply any overrides from prepareStep
      if (prepareResult?.model !== undefined) {
        currentModel = prepareResult.model;
      }
      // Apply messages override BEFORE system so the system message
      // isn't lost when messages replaces the prompt.
      if (prepareResult?.messages !== undefined) {
        conversationPrompt = [...prepareResult.messages];
      }
      if (prepareResult?.system !== undefined) {
        // Update or prepend system message in the conversation prompt.
        // Applied AFTER messages override so the system message isn't
        // lost when messages replaces the prompt.
        if (
          conversationPrompt.length > 0 &&
          conversationPrompt[0].role === 'system'
        ) {
          // Replace existing system message
          conversationPrompt[0] = {
            role: 'system',
            content: prepareResult.system,
          };
        } else {
          // Prepend new system message
          conversationPrompt.unshift({
            role: 'system',
            content: prepareResult.system,
          });
        }
      }
      if (prepareResult?.runtimeContext !== undefined) {
        currentRuntimeContext = prepareResult.runtimeContext;
      }
      if (prepareResult?.toolsContext !== undefined) {
        currentToolsContext = prepareResult.toolsContext as Record<
          string,
          Context | undefined
        >;
      }
      if (prepareResult?.activeTools !== undefined) {
        currentActiveTools = prepareResult.activeTools;
      }
      currentGenerationSettings = mergePrepareStepGenerationSettings(
        currentGenerationSettings,
        prepareResult ?? {},
      );
      if (prepareResult?.toolChoice !== undefined) {
        currentToolChoice = prepareResult.toolChoice;
      }
    }

    if (onStepStart) {
      await onStepStart({
        stepNumber,
        model: currentModel,
        messages: conversationPrompt as unknown as ModelMessage[],
        steps: [...steps],
        runtimeContext: currentRuntimeContext,
        toolsContext: currentToolsContext as never,
      });
    }

    const stepStartModelInfo = getModelInfo(currentModel);
    await telemetryDispatcher.onStepStart?.({
      callId: 'workflow-agent',
      provider: stepStartModelInfo.provider,
      modelId: stepStartModelInfo.modelId,
      stepNumber,
      system: undefined,
      messages: conversationPrompt as unknown as ModelMessage[],
      tools,
      toolChoice: currentToolChoice,
      activeTools: currentActiveTools as never,
      steps: steps.map(normalizeStepForTelemetry),
      providerOptions: currentGenerationSettings.providerOptions,
      output: undefined,
      runtimeContext: currentRuntimeContext,
      toolsContext: currentToolsContext as never,
    });

    try {
      // Filter tools if activeTools is specified
      const effectiveTools =
        currentActiveTools && currentActiveTools.length > 0
          ? (filterActiveTools({
              tools,
              activeTools: currentActiveTools,
            }) ?? tools)
          : tools;

      // Serialize tools before crossing the step boundary — zod schemas
      // contain functions that can't be serialized by the workflow runtime.
      // Tools are reconstructed with Ajv validation inside doStreamStep.
      const serializedTools = serializeToolSet(effectiveTools, {
        toolsContext: currentToolsContext as never,
        experimental_sandbox: stepSandbox,
      });
      const modelCallInfo = getModelInfo(currentModel);

      await telemetryDispatcher.onLanguageModelCallStart?.({
        callId: 'workflow-agent',
        provider: modelCallInfo.provider,
        modelId: modelCallInfo.modelId,
        system: undefined,
        messages: conversationPrompt as unknown as ModelMessage[],
        tools:
          serializedTools == null
            ? undefined
            : Object.values(serializedTools).map(tool => ({ ...tool })),
        maxOutputTokens: currentGenerationSettings.maxOutputTokens,
        temperature: currentGenerationSettings.temperature,
        topP: currentGenerationSettings.topP,
        topK: currentGenerationSettings.topK,
        presencePenalty: currentGenerationSettings.presencePenalty,
        frequencyPenalty: currentGenerationSettings.frequencyPenalty,
        stopSequences: currentGenerationSettings.stopSequences,
        seed: currentGenerationSettings.seed,
        reasoning: currentGenerationSettings.reasoning,
        providerOptions: currentGenerationSettings.providerOptions,
        headers: currentGenerationSettings.headers,
      } as never);

      const { toolCalls, finish, raw, providerExecutedToolResults } =
        await doStreamStep(
          conversationPrompt,
          currentModel,
          writable,
          serializedTools,
          {
            ...currentGenerationSettings,
            toolChoice: currentToolChoice,
            includeRawChunks,
            repairToolCall,
            responseFormat,
          },
        );
      // Reconstruct the full StepResult outside the step boundary so the
      // durable event log doesn't carry StepResult's redundant copies (or the
      // per-chunk snapshot the step used to return).
      const step = buildStepResult(raw, toolCalls, finish, {
        stepNumber,
        runtimeContext: currentRuntimeContext,
        toolsContext: currentToolsContext,
      });

      await telemetryDispatcher.onLanguageModelCallEnd?.({
        callId: step.callId,
        provider: step.model?.provider ?? 'unknown',
        modelId: step.model?.modelId ?? 'unknown',
        finishReason: step.finishReason,
        usage: step.usage,
        content: step.content,
        responseId: step.response.id,
      });

      _isFirstIteration = false;
      stepNumber++;
      steps.push(step);
      lastStep = step;
      lastStepWasToolCalls = false;

      const finishReason = finish?.finishReason;

      if (finishReason === 'tool-calls') {
        lastStepWasToolCalls = true;

        // Preserve reasoning alongside tool calls. Their provider metadata can
        // contain references that are only valid when both parts are carried
        // into the next provider request together.
        conversationPrompt.push({
          role: 'assistant',
          content: buildAssistantPromptContent(raw, toolCalls),
        });

        // Yield the tool calls along with the current conversation messages
        // This allows executeTool to pass the conversation context to tool execute functions
        // Also include provider-executed tool results so they can be used instead of local execution
        const toolResults = yield {
          toolCalls,
          messages: conversationPrompt,
          step,
          runtimeContext: currentRuntimeContext,
          toolsContext: currentToolsContext,
          experimental_sandbox: stepSandbox,
          providerExecutedToolResults,
        };

        conversationPrompt.push({
          role: 'tool',
          content: toolResults,
        });

        if (stopConditions) {
          const stopConditionList = Array.isArray(stopConditions)
            ? stopConditions
            : [stopConditions];
          if (stopConditionList.some(test => test({ steps }))) {
            done = true;
          }
        }
      } else if (finishReason === 'stop') {
        // Add assistant message with text content to the conversation
        const textContent = step.content.filter(
          item => item.type === 'text',
        ) as Array<{ type: 'text'; text: string }>;

        if (textContent.length > 0) {
          conversationPrompt.push({
            role: 'assistant',
            content: textContent,
          });
        }

        done = true;
      } else if (finishReason === 'length') {
        // Model hit max tokens - stop but don't throw
        done = true;
      } else if (finishReason === 'content-filter') {
        // Content filter triggered - stop but don't throw
        done = true;
      } else if (finishReason === 'error') {
        // Model error - stop but don't throw
        done = true;
      } else if (finishReason === 'other') {
        // Other reason - stop but don't throw
        done = true;
      } else if (finishReason === 'unknown') {
        // Unknown reason - stop but don't throw
        done = true;
      } else if (!finishReason) {
        // No finish reason - this might happen on incomplete streams
        done = true;
      } else {
        throw new Error(
          `Unexpected finish reason: ${typeof finish?.finishReason === 'object' ? JSON.stringify(finish?.finishReason) : finish?.finishReason}`,
        );
      }

      const resolvedOnStepEnd = onStepEnd ?? onStepFinish;
      if (resolvedOnStepEnd) {
        await resolvedOnStepEnd(step);
      }
      await telemetryDispatcher.onStepEnd?.(normalizeStepForTelemetry(step));
    } catch (error) {
      if (onError) {
        await onError({ error });
      }
      throw error;
    }
  }

  // Yield the final step if it wasn't already yielded (tool-calls steps are yielded inside the loop)
  if (lastStep && !lastStepWasToolCalls) {
    yield {
      toolCalls: [],
      messages: conversationPrompt,
      step: lastStep,
      runtimeContext: currentRuntimeContext,
      toolsContext: currentToolsContext,
      experimental_sandbox: sandbox,
    };
  }

  return conversationPrompt;
}

function getModelInfo(model: LanguageModel): {
  provider: string;
  modelId: string;
} {
  return typeof model === 'string'
    ? { provider: model.split('/')[0] ?? 'gateway', modelId: model }
    : { provider: model.provider, modelId: model.modelId };
}

function normalizeStepForTelemetry(step: StepResult<any, any>) {
  return {
    ...step,
    model: step.model ?? { provider: 'unknown', modelId: 'unknown' },
  };
}

/**
 * Reconstruct a full `StepResult` from the minimal aggregates returned by
 * `doStreamStep`. Runs outside the step boundary so StepResult's redundant
 * fields (duplicate tool-call lists, `content`, `reasoningText`, the
 * always-empty `*ToolResults` arrays) and the per-chunk snapshot don't cross
 * it. The shape matches what the AI SDK's `streamText` exposes to callers.
 */
function buildStepResult(
  raw: DoStreamStepRawResult,
  toolCalls: ParsedToolCall[],
  finish: StreamFinish | undefined,
  opts: {
    stepNumber: number;
    runtimeContext: Context;
    toolsContext: Record<string, Context | undefined>;
  },
): StepResult<ToolSet, any> {
  const { text, reasoning: reasoningParts, responseMetadata, warnings } = raw;
  const reasoningText =
    reasoningParts.map(part => part.text).join('') || undefined;

  const reasoningContentByIndex = reasoningParts.map(part => ({
    type: 'reasoning' as const,
    text: part.text,
    ...(part.providerMetadata != null
      ? { providerMetadata: part.providerMetadata }
      : {}),
  }));
  const reasoningFileContentByIndex = (raw.reasoningFiles ?? []).map(part => ({
    type: 'reasoning-file' as const,
    file: new DefaultGeneratedFile({
      data: part.data,
      mediaType: part.mediaType,
    }),
    ...(part.providerMetadata != null
      ? { providerMetadata: part.providerMetadata }
      : {}),
  }));

  const toolCallContentByIndex = toolCalls.map(toolCall =>
    toolCall.invalid
      ? undefined
      : ({
          type: 'tool-call' as const,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
          ...(toolCall.dynamic ? { dynamic: true as const } : {}),
        } as const),
  );
  const validToolCalls = toolCallContentByIndex.filter(
    (
      toolCall,
    ): toolCall is NonNullable<(typeof toolCallContentByIndex)[number]> =>
      toolCall != null,
  );

  const contentOrder = getReasoningAndToolCallOrder(raw, toolCalls);
  const orderedGeneratedContent: WorkflowStepContentPart[] = [];
  for (const part of contentOrder) {
    switch (part.type) {
      case 'reasoning': {
        const reasoningPart = reasoningContentByIndex[part.index];
        if (reasoningPart != null) {
          orderedGeneratedContent.push(reasoningPart);
        }
        break;
      }
      case 'reasoning-file': {
        const reasoningFile = reasoningFileContentByIndex[part.index];
        if (reasoningFile != null) {
          orderedGeneratedContent.push(reasoningFile);
        }
        break;
      }
      case 'tool-call': {
        const toolCall = toolCallContentByIndex[part.index];
        if (toolCall != null) {
          orderedGeneratedContent.push(toolCall);
        }
        break;
      }
    }
  }
  const reasoningContent = orderedGeneratedContent.filter(
    (part): part is WorkflowReasoningContentPart =>
      part.type === 'reasoning' || part.type === 'reasoning-file',
  );
  const reasoning = reasoningContent.map(part =>
    part.type === 'reasoning'
      ? {
          type: 'reasoning' as const,
          text: part.text,
          ...(part.providerMetadata != null
            ? { providerOptions: part.providerMetadata }
            : {}),
        }
      : {
          type: 'reasoning-file' as const,
          data: part.file.base64,
          mediaType: part.file.mediaType,
          ...(part.providerMetadata != null
            ? { providerOptions: part.providerMetadata }
            : {}),
        },
  );

  return {
    callId: 'workflow-agent',
    stepNumber: opts.stepNumber,
    model: {
      provider: responseMetadata?.modelId?.split(':')[0] ?? 'unknown',
      modelId: responseMetadata?.modelId ?? 'unknown',
    },
    functionId: undefined,
    metadata: undefined,
    runtimeContext: opts.runtimeContext ?? {},
    toolsContext: opts.toolsContext ?? {},
    content: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...orderedGeneratedContent,
    ],
    text,
    reasoning,
    reasoningText,
    files: [],
    sources: [],
    toolCalls: validToolCalls,
    staticToolCalls: [],
    dynamicToolCalls: validToolCalls.filter(tc => tc.dynamic),
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: finish?.finishReason ?? 'other',
    rawFinishReason: finish?.rawFinishReason,
    usage:
      finish?.usage ??
      ({
        inputTokens: 0,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: 0,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: 0,
      } as LanguageModelUsage),
    performance: {
      effectiveOutputTokensPerSecond: 0,
      outputTokensPerSecond: undefined,
      inputTokensPerSecond: undefined,
      effectiveTotalTokensPerSecond: 0,
      stepTimeMs: 0,
      responseTimeMs: 0,
      toolExecutionMs: {},
      timeToFirstOutputMs: undefined,
    },
    warnings,
    request: {
      body: '',
      messages: [], // TODO implement step request messages
    },
    response: {
      id: responseMetadata?.id ?? 'unknown',
      timestamp: responseMetadata?.timestamp ?? new Date(),
      modelId: responseMetadata?.modelId ?? 'unknown',
      messages: [],
    },
    providerMetadata: finish?.providerMetadata ?? {},
  } as StepResult<ToolSet, any>;
}

function getReasoningAndToolCallOrder(
  raw: DoStreamStepRawResult,
  toolCalls: ParsedToolCall[],
): NonNullable<DoStreamStepRawResult['reasoningAndToolCallOrder']> {
  return (
    raw.reasoningAndToolCallOrder ?? [
      ...raw.reasoning.map((_, index) => ({
        type: 'reasoning' as const,
        index,
      })),
      ...(raw.reasoningFiles ?? []).map((_, index) => ({
        type: 'reasoning-file' as const,
        index,
      })),
      ...toolCalls.map((_, index) => ({
        type: 'tool-call' as const,
        index,
      })),
    ]
  );
}

function buildAssistantPromptContent(
  raw: DoStreamStepRawResult,
  toolCalls: ParsedToolCall[],
): Extract<LanguageModelV4Prompt[number], { role: 'assistant' }>['content'] {
  const content: Extract<
    LanguageModelV4Prompt[number],
    { role: 'assistant' }
  >['content'] = [];

  for (const part of getReasoningAndToolCallOrder(raw, toolCalls)) {
    switch (part.type) {
      case 'reasoning': {
        const reasoningPart = raw.reasoning[part.index];
        if (reasoningPart != null) {
          content.push({
            type: 'reasoning',
            text: reasoningPart.text,
            ...(reasoningPart.providerMetadata != null
              ? { providerOptions: reasoningPart.providerMetadata }
              : {}),
          });
        }
        break;
      }
      case 'reasoning-file': {
        const reasoningFile = raw.reasoningFiles?.[part.index];
        if (reasoningFile != null) {
          content.push({
            type: 'reasoning-file',
            data: { type: 'data', data: reasoningFile.data },
            mediaType: reasoningFile.mediaType,
            ...(reasoningFile.providerMetadata != null
              ? { providerOptions: reasoningFile.providerMetadata }
              : {}),
          });
        }
        break;
      }
      case 'tool-call': {
        const toolCall = toolCalls[part.index];
        if (toolCall != null) {
          content.push({
            type: 'tool-call',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.input,
            ...(toolCall.providerExecuted != null
              ? { providerExecuted: toolCall.providerExecuted }
              : {}),
            ...(toolCall.providerMetadata != null
              ? { providerOptions: toolCall.providerMetadata }
              : {}),
          });
        }
        break;
      }
    }
  }

  return content;
}
