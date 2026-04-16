import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import type {
  Experimental_LanguageModelStreamPart as ModelCallStreamPart,
  LanguageModel,
  ModelMessage,
  StepResult,
  ToolCallRepairFunction,
  ToolChoice,
  ToolSet,
} from 'ai';
import {
  doStreamStep,
  type ModelStopCondition,
  type ParsedToolCall,
  type ProviderExecutedToolResult,
} from './do-stream-step.js';
import { serializeToolSet } from './serializable-schema.js';
import type {
  GenerationSettings,
  PrepareStepCallback,
  WorkflowAgentOnErrorCallback,
  WorkflowAgentOnStepFinishCallback,
  TelemetryOptions,
  WorkflowAgentOnStepStartCallback,
} from './workflow-agent.js';

// Re-export for consumers
export type { ProviderExecutedToolResult } from './do-stream-step.js';

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
  /** The current experimental context */
  context?: unknown;
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
  onStepFinish,
  onStepStart,
  onError,
  prepareStep,
  generationSettings,
  toolChoice,
  experimental_context,
  telemetry,
  includeRawChunks = false,
  repairToolCall,
  responseFormat,
}: {
  prompt: LanguageModelV4Prompt;
  tools: ToolSet;
  writable?: WritableStream<ModelCallStreamPart<ToolSet>>;
  model: LanguageModel;
  stopConditions?: ModelStopCondition[] | ModelStopCondition;
  onStepFinish?: WorkflowAgentOnStepFinishCallback<any>;
  onStepStart?: WorkflowAgentOnStepStartCallback;
  onError?: WorkflowAgentOnErrorCallback;
  prepareStep?: PrepareStepCallback<any>;
  generationSettings?: GenerationSettings;
  toolChoice?: ToolChoice<ToolSet>;
  experimental_context?: unknown;
  telemetry?: TelemetryOptions;
  includeRawChunks?: boolean;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
}): AsyncGenerator<
  StreamTextIteratorYieldValue,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart[]
> {
  let conversationPrompt = [...prompt]; // Create a mutable copy
  let currentModel: LanguageModel = model;
  let currentGenerationSettings = generationSettings ?? {};
  let currentToolChoice = toolChoice;
  let currentContext = experimental_context;
  let currentActiveTools: string[] | undefined;

  const steps: StepResult<any, any>[] = [];
  let done = false;
  let _isFirstIteration = true;
  let stepNumber = 0;
  let lastStep: StepResult<any, any> | undefined;
  let lastStepWasToolCalls = false;

  while (!done) {
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
      // Apply messages override BEFORE system so the system message
      // isn't lost when messages replaces the prompt.
      if (prepareResult.messages !== undefined) {
        conversationPrompt = [...prepareResult.messages];
      }
      if (prepareResult.system !== undefined) {
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

    if (onStepStart) {
      await onStepStart({
        stepNumber,
        model: currentModel,
        messages: conversationPrompt as unknown as ModelMessage[],
        steps: [...steps],
      });
    }

    try {
      // Filter tools if activeTools is specified
      const effectiveTools =
        currentActiveTools && currentActiveTools.length > 0
          ? filterToolSet(tools, currentActiveTools)
          : tools;

      // Serialize tools before crossing the step boundary — zod schemas
      // contain functions that can't be serialized by the workflow runtime.
      // Tools are reconstructed with Ajv validation inside doStreamStep.
      const serializedTools = serializeToolSet(effectiveTools);

      const { toolCalls, finish, step, providerExecutedToolResults } =
        await doStreamStep(
          conversationPrompt,
          currentModel,
          writable,
          serializedTools,
          {
            ...currentGenerationSettings,
            toolChoice: currentToolChoice,
            includeRawChunks,
            telemetry,
            repairToolCall,
            responseFormat,
          },
        );

      _isFirstIteration = false;
      stepNumber++;
      steps.push(step);
      lastStep = step;
      lastStepWasToolCalls = false;

      const finishReason = finish?.finishReason;

      if (finishReason === 'tool-calls') {
        lastStepWasToolCalls = true;

        // Add assistant message with tool calls to the conversation
        // Note: providerMetadata from the tool call is mapped to providerOptions
        // in the prompt format, following the AI SDK convention. This is critical
        // for providers like Gemini that require thoughtSignature to be preserved
        // across multi-turn tool calls. Some fields are sanitized before mapping.
        conversationPrompt.push({
          role: 'assistant',
          content: toolCalls.map(toolCall => {
            const sanitizedMetadata = sanitizeProviderMetadataForToolCall(
              toolCall.providerMetadata,
            );
            return {
              type: 'tool-call',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input,
              ...(sanitizedMetadata != null
                ? { providerOptions: sanitizedMetadata }
                : {}),
            };
          }) as typeof toolCalls,
        });

        // Yield the tool calls along with the current conversation messages
        // This allows executeTool to pass the conversation context to tool execute functions
        // Also include provider-executed tool results so they can be used instead of local execution
        const toolResults = yield {
          toolCalls,
          messages: conversationPrompt,
          step,
          context: currentContext,
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
    yield {
      toolCalls: [],
      messages: conversationPrompt,
      step: lastStep,
      context: currentContext,
    };
  }

  return conversationPrompt;
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
