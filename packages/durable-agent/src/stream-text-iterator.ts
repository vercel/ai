import type {
  AssistantContent,
  ModelMessage,
  SystemModelMessage,
  ToolContent,
  ToolResultPart,
} from '@ai-sdk/provider-utils';
import type {
  StepResult,
  StreamTextOnStepFinishCallback,
  ToolChoice,
  ToolSet,
  UIMessageChunk,
} from 'ai';
import {
  doStreamStep,
  type ModelStopCondition,
  type ParsedToolCall,
  type ProviderExecutedToolResult,
} from './do-stream-step.js';
import type {
  GenerationSettings,
  PrepareStepCallback,
  StreamTextOnErrorCallback,
  StreamTextTransform,
  TelemetrySettings,
  ToolCallRepairFunction,
} from './durable-agent.js';
import type { CompatibleLanguageModel } from './types.js';

// Re-export for consumers
export type { ProviderExecutedToolResult } from './do-stream-step.js';
export type { ParsedToolCall } from './do-stream-step.js';

/**
 * The value yielded by the stream text iterator when tool calls are requested.
 * Contains both the tool calls and the current conversation messages.
 */
export interface StreamTextIteratorYieldValue {
  /** The tool calls requested by the model (parsed with typed inputs) */
  toolCalls: ParsedToolCall[];
  /** The conversation messages up to (and including) the tool call request */
  messages: ModelMessage[];
  /** The step result from the current step */
  step?: StepResult<ToolSet>;
  /** The current experimental context */
  context?: unknown;
  /** The UIMessageChunks written during this step (only when collectUIChunks is enabled) */
  uiChunks?: UIMessageChunk[];
  /** Provider-executed tool results (keyed by tool call ID) */
  providerExecutedToolResults?: Map<string, ProviderExecutedToolResult>;
}

/**
 * Tool result passed back to the iterator via iterator.next().
 * Uses the ModelMessage ToolResultPart format.
 */
export type ToolResultInput = ToolResultPart;

// This runs in the workflow context
export async function* streamTextIterator({
  messages: initialMessages,
  system,
  tools = {},
  writable,
  model,
  stopConditions,
  maxSteps,
  sendStart = true,
  onStepFinish,
  onError,
  prepareStep,
  generationSettings,
  toolChoice,
  experimental_context,
  experimental_telemetry,
  includeRawChunks = false,
  collectUIChunks = false,
  repairToolCall,
}: {
  messages: ModelMessage[];
  system: string | SystemModelMessage | Array<SystemModelMessage> | undefined;
  tools: ToolSet;
  writable: WritableStream<UIMessageChunk>;
  model: string | (() => Promise<CompatibleLanguageModel>);
  stopConditions?: ModelStopCondition[] | ModelStopCondition;
  maxSteps?: number;
  sendStart?: boolean;
  onStepFinish?: StreamTextOnStepFinishCallback<any>;
  onError?: StreamTextOnErrorCallback;
  prepareStep?: PrepareStepCallback<any>;
  generationSettings?: GenerationSettings;
  toolChoice?: ToolChoice<ToolSet>;
  experimental_context?: unknown;
  experimental_telemetry?: TelemetrySettings;
  includeRawChunks?: boolean;
  collectUIChunks?: boolean;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
}): AsyncGenerator<
  StreamTextIteratorYieldValue,
  ModelMessage[],
  ToolResultInput[]
> {
  let conversationMessages: ModelMessage[] = [...initialMessages];
  let currentSystem = system;
  let currentModel: string | (() => Promise<CompatibleLanguageModel>) = model;
  let currentGenerationSettings = generationSettings ?? {};
  let currentToolChoice = toolChoice;
  let currentContext = experimental_context;
  let currentActiveTools: string[] | undefined;

  const steps: StepResult<any>[] = [];
  let done = false;
  let isFirstIteration = true;
  let stepNumber = 0;
  let lastStep: StepResult<any> | undefined;
  let lastStepWasToolCalls = false;
  let lastStepUIChunks: UIMessageChunk[] | undefined;
  let allAccumulatedUIChunks: UIMessageChunk[] = [];

  // Default maxSteps to Infinity to preserve backwards compatibility
  const effectiveMaxSteps = maxSteps ?? Infinity;

  while (!done) {
    if (stepNumber >= effectiveMaxSteps) {
      break;
    }

    if (currentGenerationSettings.abortSignal?.aborted) {
      break;
    }

    // Call prepareStep callback before each step if provided
    if (prepareStep) {
      const prepareResult = await prepareStep({
        model: currentModel,
        stepNumber,
        steps,
        messages: conversationMessages,
        experimental_context: currentContext,
      });

      if (prepareResult.model !== undefined) {
        currentModel = prepareResult.model;
      }
      // Apply messages override BEFORE system so the system message
      // isn't lost when messages replaces the prompt.
      // Apply messages override BEFORE system so the system message
      // isn't lost when messages replaces the prompt.
      if (prepareResult.messages !== undefined) {
        conversationMessages = [...prepareResult.messages];
      }
      if (prepareResult.system !== undefined) {
        currentSystem = prepareResult.system;
      }
      if (prepareResult.experimental_context !== undefined) {
        currentContext = prepareResult.experimental_context;
      }
      if (prepareResult.activeTools !== undefined) {
        currentActiveTools = prepareResult.activeTools;
      }
      // Apply generation settings overrides
      if (prepareResult.maxOutputTokens !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          maxOutputTokens: prepareResult.maxOutputTokens,
        };
      }
      if (prepareResult.temperature !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          temperature: prepareResult.temperature,
        };
      }
      if (prepareResult.topP !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          topP: prepareResult.topP,
        };
      }
      if (prepareResult.topK !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          topK: prepareResult.topK,
        };
      }
      if (prepareResult.presencePenalty !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          presencePenalty: prepareResult.presencePenalty,
        };
      }
      if (prepareResult.frequencyPenalty !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          frequencyPenalty: prepareResult.frequencyPenalty,
        };
      }
      if (prepareResult.stopSequences !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          stopSequences: prepareResult.stopSequences,
        };
      }
      if (prepareResult.seed !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          seed: prepareResult.seed,
        };
      }
      if (prepareResult.maxRetries !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          maxRetries: prepareResult.maxRetries,
        };
      }
      if (prepareResult.headers !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          headers: prepareResult.headers,
        };
      }
      if (prepareResult.providerOptions !== undefined) {
        currentGenerationSettings = {
          ...currentGenerationSettings,
          providerOptions: prepareResult.providerOptions,
        };
      }
      if (prepareResult.toolChoice !== undefined) {
        currentToolChoice = prepareResult.toolChoice;
      }
    }

    try {
      // Filter tools if activeTools is specified
      const effectiveTools =
        currentActiveTools && currentActiveTools.length > 0
          ? filterToolSet(tools, currentActiveTools)
          : tools;

      const {
        toolCalls,
        finish,
        step,
        uiChunks: stepUIChunks,
        providerExecutedToolResults,
      } = await doStreamStep(
        currentModel,
        conversationMessages,
        currentSystem,
        writable,
        effectiveTools,
        {
          sendStart: sendStart && isFirstIteration,
          ...currentGenerationSettings,
          toolChoice: currentToolChoice,
          includeRawChunks,
          experimental_telemetry,
          repairToolCall,
          collectUIChunks,
        },
      );
      isFirstIteration = false;
      stepNumber++;
      steps.push(step);
      lastStep = step;
      lastStepWasToolCalls = false;
      lastStepUIChunks = stepUIChunks;

      // Aggregate UIChunks from this step
      let allStepUIChunks = [
        ...allAccumulatedUIChunks,
        ...(stepUIChunks ?? []),
      ];

      const finishReason = finish?.finishReason;

      if (finishReason === 'tool-calls') {
        lastStepWasToolCalls = true;

        // Build assistant message with tool calls
        const assistantContent = toolCalls
          .filter(tc => !tc.invalid)
          .map(tc => {
            const sanitizedMetadata = sanitizeProviderMetadataForToolCall(
              tc.providerMetadata,
            );
            return {
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
              ...(tc.providerExecuted != null
                ? { providerExecuted: tc.providerExecuted }
                : {}),
              ...(sanitizedMetadata != null
                ? { providerOptions: sanitizedMetadata }
                : {}),
            };
          }) as AssistantContent;

        conversationMessages.push({
          role: 'assistant',
          content: assistantContent,
        });

        // Yield the tool calls for the caller to execute
        const toolResults = yield {
          toolCalls,
          messages: conversationMessages,
          step,
          context: currentContext,
          uiChunks: allStepUIChunks,
          providerExecutedToolResults,
        };

        // Write tool results to the UI stream
        const toolOutputChunks = await writeToolOutputToUI(
          writable,
          toolResults,
          collectUIChunks,
        );
        if (collectUIChunks && toolOutputChunks.length > 0) {
          allStepUIChunks = [...(allStepUIChunks ?? []), ...toolOutputChunks];
          allAccumulatedUIChunks = [
            ...allAccumulatedUIChunks,
            ...toolOutputChunks,
          ];
        }

        // Add tool results to conversation
        const toolContent: ToolContent = toolResults.map(tr => ({
          type: 'tool-result' as const,
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          output: tr.output,
          ...(tr.providerOptions != null
            ? { providerOptions: tr.providerOptions }
            : {}),
        }));

        conversationMessages.push({
          role: 'tool',
          content: toolContent,
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
        // Add assistant message with text content
        const textContent = step.content.filter(
          item => item.type === 'text',
        ) as Array<{ type: 'text'; text: string }>;

        if (textContent.length > 0) {
          conversationMessages.push({
            role: 'assistant',
            content: textContent,
          });
        }

        done = true;
      } else if (
        finishReason === 'length' ||
        finishReason === 'content-filter' ||
        finishReason === 'error' ||
        finishReason === 'other' ||
        finishReason === 'unknown' ||
        !finishReason
      ) {
        done = true;
      } else {
        throw new Error(`Unexpected finish reason: ${finishReason}`);
      }

      if (onStepFinish) {
        await onStepFinish(step);
      }
    } catch (error) {
      if (onError) {
        await onError({ error });
      }
      throw error;
    }
  }

  // Yield the final step if it wasn't already yielded
  if (lastStep && !lastStepWasToolCalls) {
    const finalUIChunks = [
      ...allAccumulatedUIChunks,
      ...(lastStepUIChunks ?? []),
    ];
    yield {
      toolCalls: [],
      messages: conversationMessages,
      step: lastStep,
      context: currentContext,
      uiChunks: finalUIChunks,
    };
  }

  return conversationMessages;
}

async function writeToolOutputToUI(
  writable: WritableStream<UIMessageChunk>,
  toolResults: ToolResultInput[],
  collectUIChunks?: boolean,
): Promise<UIMessageChunk[]> {
  'use step';
  const writer = writable.getWriter();
  const chunks: UIMessageChunk[] = [];
  try {
    for (const result of toolResults) {
      const chunk: UIMessageChunk = {
        type: 'tool-output-available' as const,
        toolCallId: result.toolCallId,
        output: 'value' in result.output ? result.output.value : undefined,
      };
      if (collectUIChunks) {
        chunks.push(chunk);
      }
      await writer.write(chunk);
    }
  } finally {
    writer.releaseLock();
  }
  return chunks;
}

/**
 * Filter a tool set to only include the specified active tools.
 */
function filterToolSet(tools: ToolSet, activeTools: string[]): ToolSet {
  const filtered: ToolSet = {};
  for (const toolName of activeTools) {
    if (toolName in tools) {
      filtered[toolName] = tools[toolName];
    }
  }
  return filtered;
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

  if ('openai' in meta && meta.openai != null) {
    const { openai, ...restProviders } = meta;
    const openaiMeta = openai as Record<string, unknown>;

    const { itemId: _itemId, ...restOpenai } = openaiMeta;

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
