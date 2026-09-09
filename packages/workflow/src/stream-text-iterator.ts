import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import type { Context } from '@ai-sdk/provider-utils';
import {
  DefaultGeneratedFile,
  experimental_filterActiveTools as filterActiveTools,
  type ActiveTools,
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
  type ModelCallStreamPart,
  type ModelStopCondition,
  type ParsedToolCall,
  type ProviderExecutedToolResult,
  type StreamFinish,
  type ToolInputLifecycleEvent,
} from './do-stream-step.js';
import { resolveToolContext } from './resolve-tool-context.js';
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

export interface StreamTextIteratorAbortedValue {
  aborted: true;
  messages: LanguageModelV4Prompt;
}

export interface StreamTextIteratorErrorValue {
  error: unknown;
  messages: LanguageModelV4Prompt;
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
  timeoutAt,
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
  timeoutAt?: number;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
  experimental_sandbox?: SandboxSession;
}): AsyncGenerator<
  StreamTextIteratorYieldValue,
  | LanguageModelV4Prompt
  | StreamTextIteratorAbortedValue
  | StreamTextIteratorErrorValue,
  LanguageModelV4ToolResultPart[]
> {
  let conversationPrompt = [...prompt]; // Create a mutable copy
  let currentModel: LanguageModel = model;
  let currentGenerationSettings = generationSettings ?? {};
  let currentToolChoice = toolChoice;
  let currentRuntimeContext: Context = runtimeContext ?? {};
  let currentToolsContext: Record<string, Context | undefined> =
    toolsContext ?? {};
  let currentActiveTools: ActiveTools<ToolSet>;

  const steps: StepResult<any, any>[] = [];
  let done = false;
  let _isFirstIteration = true;
  let stepNumber = 0;
  let lastStep: StepResult<any, any> | undefined;
  let lastStepWasToolCalls = false;
  let wasAborted = false;
  let terminalError: unknown;
  let hasTerminalError = false;

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
        currentActiveTools !== undefined
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

      const stepInputMessages = conversationPrompt as unknown as ModelMessage[];
      const streamStepResult = await doStreamStep(
        conversationPrompt,
        currentModel,
        writable,
        serializedTools,
        {
          ...currentGenerationSettings,
          toolChoice: currentToolChoice,
          includeRawChunks,
          timeoutAt,
          repairToolCall,
          responseFormat,
        },
      );

      if (streamStepResult.aborted) {
        wasAborted = true;
        break;
      }

      if ('terminalError' in streamStepResult) {
        terminalError = streamStepResult.terminalError;
        hasTerminalError = true;
      }

      const {
        toolCalls,
        finish,
        raw,
        providerExecutedToolResults,
        toolInputLifecycleEvents,
      } = streamStepResult;
      await invokeToolInputLifecycleCallbacks({
        events: toolInputLifecycleEvents ?? [],
        toolCalls,
        tools: effectiveTools,
        messages: stepInputMessages,
        abortSignal: currentGenerationSettings.abortSignal,
        toolsContext: currentToolsContext,
        experimental_sandbox: stepSandbox,
      });
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
        ...(finish?.providerMetadata != null
          ? { providerMetadata: finish.providerMetadata }
          : {}),
      });

      _isFirstIteration = false;
      stepNumber++;
      steps.push(step);
      lastStep = step;
      lastStepWasToolCalls = false;

      const finishReason = finish?.finishReason;

      if (hasTerminalError) {
        // The error crossed the durable step boundary as data. End the loop
        // without throwing so WorkflowAgent can preserve the existing
        // resolved-result contract and expose the original value.
        done = true;
      } else if (finishReason === 'tool-calls') {
        lastStepWasToolCalls = true;

        const assistantContent = getAssistantMessageContent(step);
        const includedToolCallIds = new Set(
          assistantContent.flatMap(part =>
            part.type === 'tool-call' ? [part.toolCallId] : [],
          ),
        );

        // Add assistant message content in provider emission order. Invalid
        // tool calls are not part of StepResult.content, so retain the previous
        // behavior of appending them to the prompt.
        // Note: providerMetadata from the tool call is mapped to providerOptions
        // in the prompt format, following the AI SDK convention. This is critical
        // for providers like Gemini that require thoughtSignature to be preserved
        // across multi-turn tool calls. Some fields are sanitized before mapping.
        conversationPrompt.push({
          role: 'assistant',
          content: [
            ...assistantContent,
            ...toolCalls
              .filter(toolCall => !includedToolCallIds.has(toolCall.toolCallId))
              .map(toAssistantToolCallContent),
          ],
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
        // Add assistant response content to the conversation
        const assistantContent = getAssistantMessageContent(step);

        if (assistantContent.length > 0) {
          conversationPrompt.push({
            role: 'assistant',
            content: assistantContent,
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

  if (wasAborted) {
    return { aborted: true, messages: conversationPrompt };
  }

  if (hasTerminalError) {
    return { error: terminalError, messages: conversationPrompt };
  }

  return conversationPrompt;
}

async function invokeToolInputLifecycleCallbacks({
  events,
  toolCalls,
  tools,
  messages,
  abortSignal,
  toolsContext,
  experimental_sandbox,
}: {
  events: ToolInputLifecycleEvent[];
  toolCalls: ParsedToolCall[];
  tools: ToolSet;
  messages: ModelMessage[];
  abortSignal?: AbortSignal;
  toolsContext: Record<string, Context | undefined>;
  experimental_sandbox?: SandboxSession;
}) {
  const toolNamesByCallId = new Map<string, string>();
  const toolCallsById = new Map(
    toolCalls.map(toolCall => [toolCall.toolCallId, toolCall]),
  );
  const resolvedContexts = new Map<string, Promise<unknown>>();

  for (const event of events) {
    const [type, toolCallId, value] = event;
    if (type === 'start') {
      toolNamesByCallId.set(toolCallId, value);
    }

    const toolName =
      type === 'start' ? value : toolNamesByCallId.get(toolCallId);
    if (toolName == null) {
      continue;
    }

    const tool = tools[toolName];
    if (tool == null) {
      continue;
    }

    let resolvedContext = resolvedContexts.get(toolName);
    if (resolvedContext == null) {
      resolvedContext = resolveToolContext({
        toolName,
        tool,
        toolsContext,
      });
      resolvedContexts.set(toolName, resolvedContext);
    }

    const options = {
      toolCallId,
      messages,
      abortSignal,
      context: await resolvedContext,
      experimental_sandbox,
    };

    switch (type) {
      case 'start':
        await tool.onInputStart?.(options);
        break;
      case 'delta':
        await tool.onInputDelta?.({
          ...options,
          inputTextDelta: value,
        });
        break;
      case 'available': {
        const toolCall = toolCallsById.get(toolCallId);
        if (toolCall == null) {
          break;
        }
        await tool.onInputAvailable?.({
          ...options,
          input: toolCall.input,
        });
        break;
      }
    }
  }
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
 * fields (duplicate tool-call lists, `text`, `files`, `sources`, and
 * `reasoningText`) and the per-chunk snapshot don't cross it. Tool-result
 * arrays are initialized here and populated after execution. The shape matches
 * what the AI SDK's `streamText` exposes to callers.
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
  const {
    content: rawContent,
    reasoning: reasoningParts,
    responseMetadata,
    warnings,
  } = raw;
  const reasoningText = reasoningParts.map(r => r.text).join('') || undefined;
  const validToolCallsByIndex = new Map(
    toolCalls.flatMap((tc, index) =>
      tc.invalid
        ? []
        : [
            [
              index,
              {
                type: 'tool-call' as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
                ...(tc.providerExecuted != null
                  ? { providerExecuted: tc.providerExecuted }
                  : {}),
                ...(tc.title != null ? { title: tc.title } : {}),
                ...(tc.toolMetadata != null
                  ? { toolMetadata: tc.toolMetadata }
                  : {}),
                ...(tc.dynamic ? { dynamic: true as const } : {}),
                ...(tc.providerExecuted ? { providerExecuted: true } : {}),
                ...(tc.providerMetadata != null
                  ? { providerMetadata: tc.providerMetadata }
                  : {}),
              },
            ] as const,
          ],
    ),
  );
  const validToolCalls = [...validToolCallsByIndex.values()];
  const content: StepResult<ToolSet, any>['content'] = [];
  const files: StepResult<ToolSet, any>['files'] = [];
  const sources: StepResult<ToolSet, any>['sources'] = [];
  let text = '';

  for (const part of rawContent) {
    switch (part.type) {
      case 'text':
        text += part.text;
        content.push({
          type: 'text',
          text: part.text,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        });
        break;
      case 'file': {
        const file = new DefaultGeneratedFile({
          data: part.data,
          mediaType: part.mediaType,
          providerMetadata: part.providerMetadata,
        });
        files.push(file);
        content.push({
          type: 'file',
          file,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        });
        break;
      }
      case 'source':
        sources.push(part);
        content.push(part);
        break;
      case 'tool-call': {
        const toolCall = validToolCallsByIndex.get(part.toolCallIndex);
        if (toolCall != null) {
          content.push(toolCall);
        }
        break;
      }
    }
  }

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
    content,
    text,
    reasoning: reasoningParts.map(r => ({
      type: 'reasoning' as const,
      text: r.text,
    })),
    reasoningText,
    files,
    sources,
    toolCalls: validToolCalls,
    staticToolCalls: validToolCalls.filter(tc => tc.dynamic !== true),
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

function getAssistantMessageContent(
  step: StepResult<any, any>,
): Extract<LanguageModelV4Prompt[number], { role: 'assistant' }>['content'] {
  const content: Extract<
    LanguageModelV4Prompt[number],
    { role: 'assistant' }
  >['content'] = [];

  for (const part of step.content) {
    switch (part.type) {
      case 'text':
        if (part.text.length > 0) {
          content.push({ type: 'text', text: part.text });
        }
        break;
      case 'file':
        content.push({
          type: 'file',
          data: { type: 'data', data: part.file.base64 },
          mediaType: part.file.mediaType,
          ...(part.providerMetadata != null
            ? {
                providerOptions:
                  part.providerMetadata as SharedV4ProviderOptions,
              }
            : {}),
        });
        break;
      case 'tool-call':
        content.push(toAssistantToolCallContent(part));
        break;
    }
  }

  return content;
}

function toAssistantToolCallContent(toolCall: {
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  providerMetadata?: unknown;
}) {
  const sanitizedMetadata = sanitizeProviderMetadataForToolCall(
    toolCall.providerMetadata,
  );
  return {
    type: 'tool-call' as const,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
    ...(toolCall.providerExecuted != null
      ? { providerExecuted: toolCall.providerExecuted }
      : {}),
    ...(sanitizedMetadata != null
      ? {
          providerOptions: sanitizedMetadata as SharedV4ProviderOptions,
        }
      : {}),
  };
}

/**
 * Strip OpenAI's itemId from providerMetadata (requires reasoning items we don't preserve).
 * Preserves all other provider metadata (e.g., Gemini's thoughtSignature).
 */
function sanitizeProviderMetadataForToolCall(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (metadata == null) return undefined;

  const meta = metadata as Record<string, unknown>;

  // Check if OpenAI metadata exists and needs sanitization
  if ('openai' in meta && meta.openai != null) {
    const { openai, ...restProviders } = meta;
    const openaiMeta = openai as Record<string, unknown>;

    // Remove itemId from OpenAI metadata - it requires reasoning items we don't preserve
    const { itemId: _itemId, ...restOpenai } = openaiMeta;

    // Reconstruct metadata without itemId
    const hasOtherOpenaiFields = Object.keys(restOpenai).length > 0;
    const hasOtherProviders = Object.keys(restProviders).length > 0;

    if (hasOtherOpenaiFields && hasOtherProviders) {
      return { ...restProviders, openai: restOpenai };
    } else if (hasOtherOpenaiFields) {
      return { openai: restOpenai };
    } else if (hasOtherProviders) {
      return restProviders;
    }
    return undefined;
  }

  return meta;
}
