import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import {
  experimental_filterActiveTools as filterActiveTools,
  type Experimental_LanguageModelStreamPart as ModelCallStreamPart,
  type LanguageModel,
  type ModelMessage,
  type StepResult,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
} from 'ai';
import {
  doStreamStep,
  type DoStreamStepResult,
  type ModelStopCondition,
  type ParsedToolCall,
  type ProviderExecutedToolResult,
} from './do-stream-step.js';
import { serializeToolSet } from './serializable-schema.js';
import { applyPrepareStepResult } from './prepare-step-utils.js';
import type {
  GenerationSettings,
  PrepareStepCallback,
  WorkflowAgentOnErrorCallback,
  WorkflowAgentOnStepFinishCallback,
  WorkflowAgentOnToolExecutionStartCallback,
  WorkflowAgentOnToolExecutionEndCallback,
  TelemetryOptions,
  WorkflowAgentOnStepStartCallback,
  ToolsInput,
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
  toolsResolver,
  writable,
  model,
  stopConditions,
  onStepFinish,
  onStepStart,
  onToolExecutionStart,
  onToolExecutionEnd,
  onError,
  prepareStep,
  generationSettings,
  toolChoice,
  experimental_context,
  telemetry,
  includeRawChunks = false,
  repairToolCall,
  responseFormat,
  activeTools,
}: {
  prompt: LanguageModelV4Prompt;
  /** @deprecated Use toolsResolver instead for factory pattern */
  tools?: ToolSet;
  /** Tools resolver - static ToolSet or factory function (resolved inside step) */
  toolsResolver?: ToolsInput<ToolSet>;
  writable?: WritableStream<ModelCallStreamPart<ToolSet>>;
  model: LanguageModel;
  stopConditions?: ModelStopCondition[] | ModelStopCondition;
  onStepFinish?: WorkflowAgentOnStepFinishCallback<any>;
  onStepStart?: WorkflowAgentOnStepStartCallback;
  onToolExecutionStart?: WorkflowAgentOnToolExecutionStartCallback;
  onToolExecutionEnd?: WorkflowAgentOnToolExecutionEndCallback;
  onError?: WorkflowAgentOnErrorCallback;
  prepareStep?: PrepareStepCallback<any>;
  generationSettings?: GenerationSettings;
  toolChoice?: ToolChoice<ToolSet>;
  experimental_context?: unknown;
  telemetry?: TelemetryOptions;
  includeRawChunks?: boolean;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
  activeTools?: string[];
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
  let currentActiveTools: string[] | undefined = activeTools;

  const useToolsResolver = toolsResolver !== undefined;

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

    if (onStepStart) {
      await onStepStart({
        stepNumber,
        model: currentModel,
        messages: conversationPrompt as unknown as ModelMessage[],
        steps: [...steps],
      });
    }

    try {
      let stepResult: DoStreamStepResult;

      if (useToolsResolver) {
        stepResult = await doStreamStep(
          conversationPrompt,
          currentModel,
          writable,
          undefined, // No serialized tools - using resolver
          {
            ...currentGenerationSettings,
            toolChoice: currentToolChoice,
            includeRawChunks,
            telemetry,
            repairToolCall,
            responseFormat,
            // Pass tools resolver and callbacks to run inside the step
            toolsResolver,
            prepareStep,
            onStepFinish,
            onToolExecutionStart,
            onToolExecutionEnd,
            stepNumber,
            steps: [...steps],
            experimentalContext: currentContext,
            activeTools: currentActiveTools,
          },
        );

        if (stepResult.updatedContext !== undefined) {
          currentContext = stepResult.updatedContext;
        }
        if (stepResult.updatedModel !== undefined) {
          currentModel = stepResult.updatedModel;
        }
        if (stepResult.updatedActiveTools !== undefined) {
          currentActiveTools = stepResult.updatedActiveTools;
        }
      } else {
        if (prepareStep) {
          const prepareResult = await prepareStep({
            model: currentModel,
            stepNumber,
            steps,
            messages: conversationPrompt,
            experimental_context: currentContext,
          });

          const applied = applyPrepareStepResult(
            prepareResult,
            conversationPrompt,
          );

          if (applied.model) currentModel = applied.model;
          if (applied.messages) conversationPrompt = applied.messages;
          if (applied.context !== undefined) currentContext = applied.context;
          if (applied.activeTools) currentActiveTools = applied.activeTools;
          if (applied.toolChoice) currentToolChoice = applied.toolChoice;
          if (Object.keys(applied.generationSettings).length > 0) {
            currentGenerationSettings = {
              ...currentGenerationSettings,
              ...applied.generationSettings,
            };
          }
        }

        const effectiveTools =
          currentActiveTools && currentActiveTools.length > 0
            ? (filterActiveTools({
                tools: tools ?? {},
                activeTools: currentActiveTools,
              }) ??
              tools ??
              {})
            : (tools ?? {});

        const serializedTools = serializeToolSet(effectiveTools);

        stepResult = await doStreamStep(
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
            stepNumber,
            steps: [...steps],
            experimentalContext: currentContext,
          },
        );
      }

      const {
        toolCalls,
        finish,
        step,
        providerExecutedToolResults,
        toolResults,
      } = stepResult;

      _isFirstIteration = false;
      stepNumber++;
      steps.push(step);
      lastStep = step;
      lastStepWasToolCalls = false;

      const finishReason = finish?.finishReason;

      if (finishReason === 'tool-calls') {
        lastStepWasToolCalls = true;

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

        if (useToolsResolver && toolResults && toolResults.length > 0) {
          conversationPrompt.push({
            role: 'tool',
            content: toolResults,
          });
        } else {
          const externalToolResults = yield {
            toolCalls,
            messages: conversationPrompt,
            step,
            context: currentContext,
            providerExecutedToolResults,
          };

          conversationPrompt.push({
            role: 'tool',
            content: externalToolResults,
          });
        }

        if (stopConditions) {
          const stopConditionList = Array.isArray(stopConditions)
            ? stopConditions
            : [stopConditions];
          if (stopConditionList.some(test => test({ steps }))) {
            done = true;
          }
        }
      } else if (finishReason === 'stop') {
        const textContent = step.content.filter(
          (item: { type: string }) => item.type === 'text',
        ) as Array<{ type: 'text'; text: string }>;

        if (textContent.length > 0) {
          conversationPrompt.push({
            role: 'assistant',
            content: textContent,
          });
        }

        done = true;
      } else if (finishReason === 'length') {
        done = true;
      } else if (finishReason === 'content-filter') {
        done = true;
      } else if (finishReason === 'error') {
        done = true;
      } else if (finishReason === 'other') {
        done = true;
      } else if (finishReason === 'unknown') {
        done = true;
      } else if (!finishReason) {
        done = true;
      } else {
        throw new Error(
          `Unexpected finish reason: ${typeof finish?.finishReason === 'object' ? JSON.stringify(finish?.finishReason) : finish?.finishReason}`,
        );
      }

      if (!useToolsResolver && onStepFinish) {
        await onStepFinish(step);
      }
    } catch (error) {
      if (onError) {
        await onError({ error });
      }
      throw error;
    }
  }

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
