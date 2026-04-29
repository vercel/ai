import type {
  JSONValue,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import {
  experimental_streamLanguageModelCall as streamModelCall,
  gateway,
  type Experimental_LanguageModelStreamPart as ModelCallStreamPart,
  type FinishReason,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type StepResult,
  type StopCondition,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
} from 'ai';
import type {
  ProviderOptions,
  TelemetryOptions,
  PrepareStepCallback,
  WorkflowAgentOnStepFinishCallback,
  WorkflowAgentOnToolExecutionStartCallback,
  WorkflowAgentOnToolExecutionEndCallback,
  ToolCall,
  ToolsInput,
} from './workflow-agent.js';
import {
  resolveSerializableTools,
  type SerializableToolDef,
} from './serializable-schema.js';
import {
  applyPrepareStepResult,
  filterToolsByActiveTools,
  getErrorMessage,
} from './prepare-step-utils.js';
export type { Experimental_LanguageModelStreamPart as ModelCallStreamPart } from 'ai';

export type ModelStopCondition = StopCondition<NoInfer<ToolSet>, any>;

/**
 * Provider-executed tool result captured from the stream.
 */
export interface ProviderExecutedToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

/**
 * Options for the doStreamStep function.
 */
export interface DoStreamStepOptions {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  providerOptions?: ProviderOptions;
  toolChoice?: ToolChoice<ToolSet>;
  includeRawChunks?: boolean;
  telemetry?: TelemetryOptions;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
  toolsResolver?: ToolsInput<ToolSet>;
  prepareStep?: PrepareStepCallback<ToolSet>;
  onStepFinish?: WorkflowAgentOnStepFinishCallback<ToolSet>;
  onToolExecutionStart?: WorkflowAgentOnToolExecutionStartCallback;
  onToolExecutionEnd?: WorkflowAgentOnToolExecutionEndCallback;
  stepNumber?: number;
  steps?: StepResult<ToolSet, any>[];
  experimentalContext?: unknown;
  activeTools?: string[];
}

/**
 * Parsed tool call from the stream (parsed by streamModelCall's transform).
 */
export interface ParsedToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  providerMetadata?: Record<string, unknown>;
  dynamic?: boolean;
  invalid?: boolean;
  error?: unknown;
}

/**
 * Finish metadata from the stream.
 */
export interface StreamFinish {
  finishReason: FinishReason;
  rawFinishReason: string | undefined;
  usage: LanguageModelUsage;
  providerMetadata?: Record<string, unknown>;
}

export interface DoStreamStepResult {
  toolCalls: ParsedToolCall[];
  finish: StreamFinish | undefined;
  step: StepResult<ToolSet, any>;
  providerExecutedToolResults: Map<string, ProviderExecutedToolResult>;
  toolResults: LanguageModelV4ToolResultPart[];
  updatedContext?: unknown;
  updatedModel?: LanguageModel;
  updatedActiveTools?: string[];
}

async function resolveTools(
  toolsInput: ToolsInput<ToolSet> | undefined,
): Promise<ToolSet> {
  if (!toolsInput) return {};
  if (typeof toolsInput === 'function') {
    return await toolsInput();
  }
  return toolsInput;
}

async function executeToolInStep(
  toolCall: { toolCallId: string; toolName: string; input: unknown },
  tools: ToolSet,
  messages: LanguageModelV4Prompt,
  experimentalContext?: unknown,
): Promise<LanguageModelV4ToolResultPart> {
  const tool = tools[toolCall.toolName];
  if (!tool) throw new Error(`Tool "${toolCall.toolName}" not found`);
  if (typeof tool.execute !== 'function') {
    throw new Error(
      `Tool "${toolCall.toolName}" does not have an execute function. ` +
        `Client-side tools should be filtered before calling executeToolInStep.`,
    );
  }

  try {
    const { execute } = tool;
    const toolResult = await execute(toolCall.input, {
      toolCallId: toolCall.toolCallId,
      messages,
      context: experimentalContext,
    });

    const output =
      typeof toolResult === 'string'
        ? { type: 'text' as const, value: toolResult }
        : { type: 'json' as const, value: toolResult as JSONValue };

    return {
      type: 'tool-result' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output,
    };
  } catch (error) {
    return {
      type: 'tool-result',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output: {
        type: 'error-text',
        value: getErrorMessage(error),
      },
    };
  }
}

export async function doStreamStep(
  conversationPrompt: LanguageModelV4Prompt,
  modelInit: LanguageModel,
  writable?: WritableStream<ModelCallStreamPart<ToolSet>>,
  serializedTools?: Record<string, SerializableToolDef>,
  options?: DoStreamStepOptions,
): Promise<DoStreamStepResult> {
  'use step';

  let model: LanguageModel =
    typeof modelInit === 'string'
      ? gateway.languageModel(modelInit)
      : modelInit;

  let tools: ToolSet | undefined;
  if (options?.toolsResolver) {
    tools = await resolveTools(options.toolsResolver);
  } else if (serializedTools) {
    tools = resolveSerializableTools(serializedTools);
  }

  if (tools && options?.activeTools && options.activeTools.length > 0) {
    tools = filterToolsByActiveTools(tools, options.activeTools);
  }

  let currentPrompt = conversationPrompt;
  let currentContext = options?.experimentalContext;
  let updatedActiveTools = options?.activeTools;
  let effectiveOptions = options;

  if (options?.prepareStep) {
    const prepareResult = await options.prepareStep({
      model,
      stepNumber: options.stepNumber ?? 0,
      steps: options.steps ?? [],
      messages: currentPrompt,
      experimental_context: currentContext,
    });

    const applied = applyPrepareStepResult(prepareResult, currentPrompt);

    if (applied.model) model = applied.model;
    if (applied.messages) currentPrompt = applied.messages;
    if (applied.context !== undefined) currentContext = applied.context;
    if (applied.activeTools) {
      updatedActiveTools = applied.activeTools;
      if (tools) {
        tools = filterToolsByActiveTools(tools, updatedActiveTools);
      }
    }
    if (applied.toolChoice) {
      effectiveOptions = {
        ...effectiveOptions,
        toolChoice: applied.toolChoice,
      };
    }
    if (Object.keys(applied.generationSettings).length > 0) {
      effectiveOptions = { ...effectiveOptions, ...applied.generationSettings };
    }
  }

  const { stream: modelStream } = await streamModelCall({
    model,
    messages: currentPrompt as unknown as ModelMessage[],
    allowSystemInMessages: true,
    tools,
    toolChoice: effectiveOptions?.toolChoice,
    includeRawChunks: effectiveOptions?.includeRawChunks,
    providerOptions: effectiveOptions?.providerOptions,
    abortSignal: effectiveOptions?.abortSignal,
    headers: effectiveOptions?.headers,
    maxOutputTokens: effectiveOptions?.maxOutputTokens,
    temperature: effectiveOptions?.temperature,
    topP: effectiveOptions?.topP,
    topK: effectiveOptions?.topK,
    presencePenalty: effectiveOptions?.presencePenalty,
    frequencyPenalty: effectiveOptions?.frequencyPenalty,
    stopSequences: effectiveOptions?.stopSequences,
    seed: effectiveOptions?.seed,
    repairToolCall: effectiveOptions?.repairToolCall,
  });

  const toolCalls: ParsedToolCall[] = [];
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  let finish: StreamFinish | undefined;

  let text = '';
  const reasoningParts: Array<{ text: string }> = [];
  let responseMetadata:
    | { id?: string; timestamp?: Date; modelId?: string }
    | undefined;
  let warnings: unknown[] | undefined;

  const writer = writable?.getWriter();

  try {
    for await (const part of modelStream) {
      switch (part.type) {
        case 'text-delta':
          text += part.text;
          break;
        case 'reasoning-delta':
          reasoningParts.push({ text: part.text });
          break;
        case 'tool-call': {
          const toolCallPart = part as typeof part & Partial<ParsedToolCall>;
          toolCalls.push({
            type: 'tool-call',
            toolCallId: toolCallPart.toolCallId,
            toolName: toolCallPart.toolName,
            input: toolCallPart.input,
            providerExecuted: toolCallPart.providerExecuted,
            providerMetadata: toolCallPart.providerMetadata as
              | Record<string, unknown>
              | undefined,
            dynamic: toolCallPart.dynamic,
            invalid: toolCallPart.invalid,
            error: toolCallPart.error,
          });
          break;
        }
        case 'tool-result':
          if (part.providerExecuted) {
            providerExecutedToolResults.set(part.toolCallId, {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.output,
              isError: false,
            });
          }
          break;
        case 'tool-error': {
          const errorPart = part as typeof part & {
            providerExecuted?: boolean;
          };
          if (errorPart.providerExecuted) {
            providerExecutedToolResults.set(errorPart.toolCallId, {
              toolCallId: errorPart.toolCallId,
              toolName: errorPart.toolName,
              result: errorPart.error,
              isError: true,
            });
          }
          break;
        }
        case 'model-call-end':
          finish = {
            finishReason: part.finishReason,
            rawFinishReason: part.rawFinishReason,
            usage: part.usage,
            providerMetadata: part.providerMetadata as
              | Record<string, unknown>
              | undefined,
          };
          break;
        case 'model-call-start':
          warnings = part.warnings;
          break;
        case 'model-call-response-metadata':
          responseMetadata = part;
          break;
      }

      if (writer) {
        await writer.write(part);
      }
    }
  } finally {
    writer?.releaseLock();
  }

  const toolResults: LanguageModelV4ToolResultPart[] = [];

  if (finish?.finishReason === 'tool-calls' && tools) {
    const invalidToolCalls = toolCalls.filter(tc => tc.invalid === true);
    const validToolCalls = toolCalls.filter(tc => tc.invalid !== true);
    const nonProviderToolCalls = validToolCalls.filter(
      tc => !tc.providerExecuted,
    );
    const providerToolCalls = validToolCalls.filter(tc => tc.providerExecuted);

    const executableToolCalls = nonProviderToolCalls.filter(tc => {
      const tool = tools[tc.toolName];
      if (!tool || typeof tool.execute !== 'function') return false;
      if (tool.needsApproval != null) return false;
      return true;
    });

    for (const toolCall of executableToolCalls) {
      const toolCallEvent: ToolCall = {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      };

      if (options?.onToolExecutionStart) {
        await options.onToolExecutionStart({
          toolCall: toolCallEvent,
          stepNumber: options.stepNumber ?? 0,
        });
      }

      const startTime = Date.now();
      let result: LanguageModelV4ToolResultPart;
      let executionError: unknown;

      try {
        result = await executeToolInStep(
          toolCall,
          tools,
          currentPrompt,
          currentContext,
        );
      } catch (err) {
        executionError = err;
        result = {
          type: 'tool-result',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: {
            type: 'error-text',
            value: getErrorMessage(err),
          },
        };
      }

      const durationMs = Date.now() - startTime;

      if (options?.onToolExecutionEnd) {
        const isError =
          result.output &&
          'type' in result.output &&
          (result.output.type === 'error-text' ||
            result.output.type === 'error-json');
        if (isError || executionError) {
          await options.onToolExecutionEnd({
            toolCall: toolCallEvent,
            stepNumber: options.stepNumber ?? 0,
            durationMs,
            success: false,
            error:
              executionError ??
              ('value' in result.output ? result.output.value : undefined),
          });
        } else {
          await options.onToolExecutionEnd({
            toolCall: toolCallEvent,
            stepNumber: options.stepNumber ?? 0,
            durationMs,
            success: true,
            output:
              result.output && 'value' in result.output
                ? result.output.value
                : undefined,
          });
        }
      }

      toolResults.push(result);
    }

    for (const tc of providerToolCalls) {
      const streamResult = providerExecutedToolResults.get(tc.toolCallId);
      if (streamResult) {
        const isString = typeof streamResult.result === 'string';
        toolResults.push({
          type: 'tool-result',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: isString
            ? streamResult.isError
              ? {
                  type: 'error-text' as const,
                  value: streamResult.result as string,
                }
              : { type: 'text' as const, value: streamResult.result as string }
            : streamResult.isError
              ? {
                  type: 'error-json' as const,
                  value: streamResult.result as JSONValue,
                }
              : {
                  type: 'json' as const,
                  value: streamResult.result as JSONValue,
                },
        });
      }
    }

    for (const tc of invalidToolCalls) {
      toolResults.push({
        type: 'tool-result',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        output: {
          type: 'error-text',
          value: getErrorMessage(tc.error),
        },
      });
    }
  }

  const reasoningText = reasoningParts.map(r => r.text).join('') || undefined;

  const step: StepResult<ToolSet, any> = {
    callId: 'workflow-agent',
    stepNumber: options?.stepNumber ?? 0,
    model: {
      provider: responseMetadata?.modelId?.split(':')[0] ?? 'unknown',
      modelId: responseMetadata?.modelId ?? 'unknown',
    },
    functionId: undefined,
    metadata: undefined,
    runtimeContext: undefined,
    toolsContext: {},
    content: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...toolCalls
        .filter(tc => !tc.invalid)
        .map(tc => ({
          type: 'tool-call' as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
          ...(tc.dynamic ? { dynamic: true as const } : {}),
        })),
    ],
    text,
    reasoning: reasoningParts.map(r => ({
      type: 'reasoning' as const,
      text: r.text,
    })),
    reasoningText,
    files: [],
    sources: [],
    toolCalls: toolCalls
      .filter(tc => !tc.invalid)
      .map(tc => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
        ...(tc.dynamic ? { dynamic: true as const } : {}),
      })),
    staticToolCalls: [],
    dynamicToolCalls: toolCalls
      .filter(tc => !tc.invalid && tc.dynamic)
      .map(tc => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
        dynamic: true as const,
      })),
    toolResults: toolResults.map(r => {
      const tc = toolCalls.find(tc => tc.toolCallId === r.toolCallId);
      return {
        type: 'tool-result' as const,
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        input: tc?.input,
        output: 'value' in r.output ? r.output.value : undefined,
      };
    }),
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
    warnings,
    request: { body: '' },
    response: {
      id: responseMetadata?.id ?? 'unknown',
      timestamp: responseMetadata?.timestamp ?? new Date(),
      modelId: responseMetadata?.modelId ?? 'unknown',
      messages: [],
    },
    providerMetadata: finish?.providerMetadata ?? {},
  } as StepResult<ToolSet, any>;

  if (options?.onStepFinish) {
    await options.onStepFinish(step);
  }

  return {
    toolCalls,
    finish,
    step,
    providerExecutedToolResults,
    toolResults,
    updatedContext: currentContext,
    updatedModel: model,
    updatedActiveTools,
  };
}
