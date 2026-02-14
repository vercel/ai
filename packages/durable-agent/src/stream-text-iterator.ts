import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3ToolCall,
  LanguageModelV3ToolCallPart,
  LanguageModelV3ToolResultPart,
} from '@ai-sdk/provider';
import type {
  FinishReason,
  StepResult,
  StreamTextOnStepFinishCallback,
  ToolChoice,
  ToolSet,
  UIMessageChunk,
} from 'ai';
import {
  doStreamStep,
  type ModelStopCondition,
  type ProviderExecutedToolResult,
} from './do-stream-step.js';
import type {
  GenerationSettings,
  PrepareStepCallback,
  StreamTextOnErrorCallback,
  StreamTextTransform,
  TelemetrySettings,
} from './durable-agent.js';
import { toolsToModelTools } from './tools-to-model-tools.js';
import type { CompatibleLanguageModel } from './types.js';

// Re-export for consumers
export type { ProviderExecutedToolResult } from './do-stream-step.js';

/**
 * The value yielded by the stream text iterator when tool calls are requested.
 * Contains both the tool calls and the current conversation messages.
 */
export interface StreamTextIteratorYieldValue {
  /** The tool calls requested by the model (with stringified JSON input) */
  toolCalls: LanguageModelV3ToolCall[];
  /** The conversation messages up to (and including) the tool call request */
  messages: LanguageModelV3Prompt;
  /** The step result from the current step */
  step?: StepResult<ToolSet>;
  /** The current experimental context */
  context?: unknown;
  /** The UIMessageChunks written during this step (only when collectUIChunks is enabled) */
  uiChunks?: UIMessageChunk[];
  /** Provider-executed tool results (keyed by tool call ID) */
  providerExecutedToolResults?: Map<string, ProviderExecutedToolResult>;
}

// This runs in the workflow context
export async function* streamTextIterator({
  prompt,
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
  experimental_transform,
  responseFormat,
  collectUIChunks = false,
}: {
  prompt: LanguageModelV3Prompt;
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
  experimental_transform?:
    | StreamTextTransform<ToolSet>
    | Array<StreamTextTransform<ToolSet>>;
  responseFormat?: LanguageModelV3CallOptions['responseFormat'];
  /** If true, collects UIMessageChunks for later conversion to UIMessage[] */
  collectUIChunks?: boolean;
}): AsyncGenerator<
  StreamTextIteratorYieldValue,
  LanguageModelV3Prompt,
  LanguageModelV3ToolResultPart[]
> {
  let conversationPrompt = [...prompt]; // Create a mutable copy
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
  // (agent loops until completion unless explicitly limited)
  const effectiveMaxSteps = maxSteps ?? Infinity;

  // Convert transforms to array
  const transforms = experimental_transform
    ? Array.isArray(experimental_transform)
      ? experimental_transform
      : [experimental_transform]
    : [];

  while (!done) {
    // Check if we've exceeded the maximum number of steps
    if (stepNumber >= effectiveMaxSteps) {
      break;
    }

    // Check for abort signal
    if (currentGenerationSettings.abortSignal?.aborted) {
      break;
    }

    // Call prepareStep callback before each step if provided
    if (prepareStep) {
      const prepareResult = await prepareStep({
        model: currentModel,
        stepNumber,
        steps,
        messages: conversationPrompt,
        experimental_context: currentContext,
      });

      // Apply any overrides from prepareStep
      if (prepareResult.model !== undefined) {
        currentModel = prepareResult.model;
      }
      if (prepareResult.system !== undefined) {
        // Update or prepend system message in the conversation prompt
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
      if (prepareResult.messages !== undefined) {
        conversationPrompt = [...prepareResult.messages];
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
        conversationPrompt,
        currentModel,
        writable,
        toolsToModelTools(effectiveTools),
        {
          sendStart: sendStart && isFirstIteration,
          ...currentGenerationSettings,
          toolChoice: currentToolChoice,
          includeRawChunks,
          experimental_telemetry,
          transforms,
          responseFormat,
          collectUIChunks,
        },
      );
      isFirstIteration = false;
      stepNumber++;
      steps.push(step);
      lastStep = step;
      lastStepWasToolCalls = false;
      lastStepUIChunks = stepUIChunks;

      // Aggregate UIChunks from this step (may include tool output chunks later)
      let allStepUIChunks = [
        ...allAccumulatedUIChunks,
        ...(stepUIChunks ?? []),
      ];

      // Normalize finishReason - AI SDK v6 returns { unified, raw }, v5 returns a string
      const finishReason = normalizeFinishReason(finish?.finishReason);

      if (finishReason === 'tool-calls') {
        lastStepWasToolCalls = true;

        // Add assistant message with tool calls to the conversation
        // Note: providerMetadata from the tool call is mapped to providerOptions
        // in the prompt format, following the AI SDK convention. This is critical
        // for providers like Gemini that require thoughtSignature to be preserved
        // across multi-turn tool calls.
        conversationPrompt.push({
          role: 'assistant',
          content: toolCalls.map(toolCall => ({
            type: 'tool-call',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: JSON.parse(toolCall.input),
            ...(toolCall.providerMetadata != null
              ? { providerOptions: toolCall.providerMetadata }
              : {}),
          })),
        });

        // Yield the tool calls along with the current conversation messages
        // This allows executeTool to pass the conversation context to tool execute functions
        // Also include provider-executed tool results so they can be used instead of local execution
        const toolResults = yield {
          toolCalls,
          messages: conversationPrompt,
          step,
          context: currentContext,
          uiChunks: allStepUIChunks,
          providerExecutedToolResults,
        };

        const toolOutputChunks = await writeToolOutputToUI(
          writable,
          toolResults,
          collectUIChunks,
        );
        // Merge tool output chunks into allStepUIChunks for the next iteration
        if (collectUIChunks && toolOutputChunks.length > 0) {
          allStepUIChunks = [...(allStepUIChunks ?? []), ...toolOutputChunks];
          // Also accumulate for future steps
          allAccumulatedUIChunks = [
            ...allAccumulatedUIChunks,
            ...toolOutputChunks,
          ];
        }

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

  // Yield the final step if it wasn't already yielded (tool-calls steps are yielded inside the loop)
  if (lastStep && !lastStepWasToolCalls) {
    const finalUIChunks = [
      ...allAccumulatedUIChunks,
      ...(lastStepUIChunks ?? []),
    ];
    yield {
      toolCalls: [],
      messages: conversationPrompt,
      step: lastStep,
      context: currentContext,
      uiChunks: finalUIChunks,
    };
  }

  return conversationPrompt;
}

async function writeToolOutputToUI(
  writable: WritableStream<UIMessageChunk>,
  toolResults: LanguageModelV3ToolResultPart[],
  collectUIChunks?: boolean,
): Promise<UIMessageChunk[]> {
  'use step';
  const writer = writable.getWriter();
  const chunks: UIMessageChunk[] = [];
  try {
    for (const result of toolResults) {
      // Extract the output value from V3 tool result format
      let outputValue: unknown;
      const output = result.output;
      if ('value' in output) {
        outputValue = output.value;
      } else if (output.type === 'execution-denied') {
        outputValue = { type: 'execution-denied', reason: output.reason };
      } else {
        outputValue = output;
      }

      const chunk: UIMessageChunk = {
        type: 'tool-output-available' as const,
        toolCallId: result.toolCallId,
        output: outputValue,
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
 * Normalize finishReason from different AI SDK versions.
 * - AI SDK v6: returns { unified: 'tool-calls', raw: 'tool_use' }
 * - AI SDK v5: returns 'tool-calls' string directly
 */
function normalizeFinishReason(raw: unknown): FinishReason | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw as FinishReason;
  if (typeof raw === 'object') {
    const obj = raw as { unified?: FinishReason; type?: FinishReason };
    return obj.unified ?? obj.type ?? 'other';
  }
  return undefined;
}
