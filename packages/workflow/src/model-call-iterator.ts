import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import type { Context } from '@ai-sdk/provider-utils';
import {
  experimental_filterActiveTools as filterActiveTools,
  type ActiveTools,
  type Experimental_SandboxSession as SandboxSession,
  type Instructions,
  type LanguageModel,
  type ModelMessage,
  type StepResult,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
} from 'ai';
import {
  createRestrictedTelemetryDispatcher,
  createToolSearchState,
} from 'ai/internal';
import { buildModelStepResult } from './build-model-step-result.js';
import { doGenerateStep } from './do-generate-step.js';
import { doStreamStep } from './do-stream-step.js';
import type {
  ModelCallStreamPart,
  ModelCallOptions,
  ModelStopCondition,
  ParsedToolCall,
  ProviderExecutedToolResult,
  ToolInputLifecycleEvent,
} from './model-call.js';
import {
  addToolResultsToConversation,
  type ProviderExecutedToolResultPosition,
} from './add-tool-results-to-conversation.js';
import { toModelResponseMessages } from './to-model-response-messages.js';
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
  StreamTextTransform,
} from './workflow-agent.js';

// Re-export for consumers
export type { ProviderExecutedToolResult } from './model-call.js';

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
export interface ModelCallIteratorYieldValue {
  /** The tool calls requested by the model (parsed with typed inputs) */
  toolCalls: ParsedToolCall[];
  /** The tools available for execution in the current step. */
  tools?: ToolSet;
  /** The conversation messages up to (and including) the tool call request */
  messages: LanguageModelV4Prompt;
  /** The step result from the current step */
  step?: StepResult<ToolSet, any>;
  /** The current runtime context shared across the agent loop */
  runtimeContext?: Context;
  /** The current per-tool context, keyed by tool name */
  toolsContext?: Record<string, Context | undefined>;
  /** Provider-executed tool results, with duplicate IDs stored separately. */
  providerExecutedToolResults?: Map<string, ProviderExecutedToolResult>;
  /** Original positions of provider-executed results in assistant content. */
  providerExecutedToolResultPositions?: ProviderExecutedToolResultPosition[];
  /** The sandbox selected for the current step. */
  experimental_sandbox?: SandboxSession;
}

export interface ModelCallIteratorAbortedValue {
  aborted: true;
  messages: LanguageModelV4Prompt;
}

export interface ModelCallIteratorErrorValue {
  error: unknown;
  messages: LanguageModelV4Prompt;
}

export type ModelCallToolResults = LanguageModelV4ToolResultPart[] & {
  providerExecutedToolResultIndexes?: ReadonlySet<number>;
};

// This runs in the workflow context
export async function* modelCallIterator({
  prompt,
  mode = 'stream',
  include,
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
  experimental_transform,
  experimental_sandbox: sandbox,
}: {
  prompt: LanguageModelV4Prompt;
  mode?: 'generate' | 'stream';
  include?: ModelCallOptions['include'];
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
  experimental_transform?:
    | StreamTextTransform<ToolSet>
    | Array<StreamTextTransform<ToolSet>>;
  experimental_sandbox?: SandboxSession;
}): AsyncGenerator<
  ModelCallIteratorYieldValue,
  | LanguageModelV4Prompt
  | ModelCallIteratorAbortedValue
  | ModelCallIteratorErrorValue,
  ModelCallToolResults
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
  let lastStepWasYielded = false;
  const pendingDeferredToolCallIds = new Set<string>();
  let wasAborted = false;
  let terminalError: unknown;
  let hasTerminalError = false;
  const prepareToolSearch = createToolSearchState({
    tools,
    toolCallers: undefined,
  });

  // TODO(#12164): replace this AI-core telemetry bridge with a
  // WorkflowAgent-specific typed dispatcher. `modelCallIterator` widens
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
      if (mode === 'generate')
        currentGenerationSettings.abortSignal.throwIfAborted();
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
      const stepActiveTools = filterActiveTools({
        tools,
        activeTools: currentActiveTools,
      });
      const effectiveTools =
        prepareToolSearch(stepActiveTools, {
          toolsContext: currentToolsContext as never,
          experimental_sandbox: stepSandbox,
        }) ?? {};

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

      const stepInputMessages = (mode === 'generate'
        ? [...conversationPrompt]
        : conversationPrompt) as unknown as ModelMessage[];
      const callOptions = {
        ...currentGenerationSettings,
        toolChoice: currentToolChoice,
        includeRawChunks,
        timeoutAt,
        repairToolCall,
        responseFormat,
        include,
        experimental_transform,
      };
      const modelCallResult =
        mode === 'generate'
          ? await doGenerateStep(
              conversationPrompt,
              currentModel,
              serializedTools,
              callOptions,
            )
          : await doStreamStep(
              conversationPrompt,
              currentModel,
              writable,
              serializedTools,
              callOptions,
            );

      if (modelCallResult.aborted) {
        wasAborted = true;
        break;
      }

      if ('terminalError' in modelCallResult) {
        if (mode === 'generate') throw modelCallResult.terminalError;
        terminalError = modelCallResult.terminalError;
        hasTerminalError = true;
      }

      const {
        toolCalls,
        finish,
        raw,
        providerExecutedToolResults,
        toolInputLifecycleEvents,
      } = modelCallResult;
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
      const step = await buildModelStepResult(
        raw,
        toolCalls,
        finish,
        providerExecutedToolResults,
        {
          tools: effectiveTools,
          requestMessages:
            mode === 'generate' && include?.requestMessages
              ? stepInputMessages
              : undefined,
          stepNumber,
          runtimeContext: currentRuntimeContext,
          toolsContext: currentToolsContext,
        },
      );

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
      lastStepWasYielded = false;

      const finishReason = finish?.finishReason;
      const isToolExecutionAllowed =
        finishReason === 'tool-calls' || finishReason === 'stop';

      for (const toolCall of toolCalls) {
        if (
          toolCall.providerExecuted &&
          serializedTools[toolCall.toolName]?.supportsDeferredResults &&
          ![...providerExecutedToolResults.values()].some(
            result => result.toolCallId === toolCall.toolCallId,
          )
        ) {
          pendingDeferredToolCallIds.add(toolCall.toolCallId);
        }
      }
      for (const providerResult of providerExecutedToolResults.values()) {
        pendingDeferredToolCallIds.delete(providerResult.toolCallId);
      }

      const shouldProcessTools =
        isToolExecutionAllowed &&
        (toolCalls.length > 0 || providerExecutedToolResults.size > 0);

      if (!hasTerminalError && shouldProcessTools) {
        lastStepWasYielded = true;

        const {
          content: assistantContent,
          providerExecutedToolResultPositions,
        } = getAssistantMessageContent(step, mode);
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
          tools: effectiveTools,
          messages: conversationPrompt,
          step,
          runtimeContext: currentRuntimeContext,
          toolsContext: currentToolsContext,
          experimental_sandbox: stepSandbox,
          providerExecutedToolResults,
          providerExecutedToolResultPositions,
        };

        const responseMessages = addToolResultsToConversation({
          messages: conversationPrompt,
          toolResults,
          providerExecutedToolCallIds: new Set([
            ...toolCalls.flatMap(toolCall =>
              toolCall.providerExecuted ? [toolCall.toolCallId] : [],
            ),
            ...[...providerExecutedToolResults.values()].map(
              result => result.toolCallId,
            ),
          ]),
          providerExecutedToolResultIndexes:
            toolResults.providerExecutedToolResultIndexes,
          providerExecutedToolResultPositions,
        });
        step.response.messages.push(
          ...(mode === 'generate'
            ? toModelResponseMessages(responseMessages)
            : (responseMessages as unknown as typeof step.response.messages)),
        );

        const stopConditionList =
          stopConditions == null
            ? []
            : Array.isArray(stopConditions)
              ? stopConditions
              : [stopConditions];
        const stopConditionMet = stopConditionList.some(test =>
          test({ steps }),
        );
        const hasClientToolCalls = toolCalls.some(
          toolCall => !toolCall.providerExecuted,
        );

        done =
          stopConditionMet ||
          (!hasClientToolCalls && pendingDeferredToolCallIds.size === 0);
      } else if (
        hasTerminalError ||
        mode === 'generate' ||
        finishReason === 'stop' ||
        finishReason === 'tool-calls' ||
        finishReason === 'length' ||
        finishReason === 'content-filter' ||
        finishReason === 'error' ||
        finishReason === 'other' ||
        finishReason === 'unknown' ||
        !finishReason
      ) {
        // Add assistant response content to the conversation
        const { content: assistantContent } = getAssistantMessageContent(
          step,
          mode,
        );

        if (assistantContent.length > 0) {
          const assistantMessage = {
            role: 'assistant',
            content: assistantContent,
          } as const;
          conversationPrompt.push(assistantMessage);
          step.response.messages.push(
            ...(mode === 'generate'
              ? toModelResponseMessages([assistantMessage])
              : [
                  assistantMessage as unknown as (typeof step.response.messages)[number],
                ]),
          );
        }

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

  // Yield the final step if it wasn't already yielded inside the loop.
  if (lastStep && !lastStepWasYielded) {
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

/** Preserve assistant ordering and positions for provider-executed results. */
function getAssistantMessageContent(
  step: StepResult<any, any>,
  mode: 'generate' | 'stream',
): {
  content: Extract<
    LanguageModelV4Prompt[number],
    { role: 'assistant' }
  >['content'];
  providerExecutedToolResultPositions: ProviderExecutedToolResultPosition[];
} {
  const content: Extract<
    LanguageModelV4Prompt[number],
    { role: 'assistant' }
  >['content'] = [];
  const providerExecutedToolResultPositions: ProviderExecutedToolResultPosition[] =
    [];
  let contentIndex = 0;

  for (const part of step.content) {
    switch (part.type) {
      case 'text':
        if (part.text.length > 0) {
          content.push({
            type: 'text',
            text: part.text,
            ...(part.providerMetadata != null
              ? { providerOptions: part.providerMetadata }
              : {}),
          });
          contentIndex++;
        }
        break;
      case 'reasoning': {
        const { providerMetadata, ...messagePart } = part;
        content.push({
          ...messagePart,
          ...(providerMetadata != null
            ? { providerOptions: providerMetadata }
            : {}),
        });
        contentIndex++;
        break;
      }
      case 'custom':
        if (mode === 'generate') {
          const { providerMetadata, ...messagePart } = part;
          content.push({ ...messagePart, providerOptions: providerMetadata });
          contentIndex++;
        }
        break;
      case 'reasoning-file':
        if (mode !== 'generate') break;
      case 'file':
        content.push({
          type: part.type,
          data: { type: 'data', data: part.file.base64 },
          mediaType: part.file.mediaType,
          ...(part.providerMetadata != null
            ? {
                providerOptions:
                  part.providerMetadata as SharedV4ProviderOptions,
              }
            : {}),
        });
        contentIndex++;
        break;
      case 'tool-call':
        content.push(toAssistantToolCallContent(part));
        contentIndex++;
        break;
      case 'tool-result':
      case 'tool-error':
        if (part.providerExecuted) {
          providerExecutedToolResultPositions.push({
            toolCallId: part.toolCallId,
            contentIndex,
          });
          contentIndex++;
        }
        break;
    }
  }

  return { content, providerExecutedToolResultPositions };
}

function toAssistantToolCallContent(toolCall: {
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  providerMetadata?: unknown;
}) {
  return {
    type: 'tool-call' as const,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
    ...(toolCall.providerExecuted != null
      ? { providerExecuted: toolCall.providerExecuted }
      : {}),
    ...(toolCall.providerMetadata != null
      ? {
          providerOptions: toolCall.providerMetadata as SharedV4ProviderOptions,
        }
      : {}),
  };
}
