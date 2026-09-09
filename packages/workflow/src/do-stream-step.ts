import type {
  JSONObject,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4Source,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { isAbortError } from '@ai-sdk/provider-utils';
import {
  experimental_streamLanguageModelCall as streamModelCall,
  gateway,
  type Experimental_LanguageModelStreamPart,
  type FinishReason,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type StopCondition,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
} from 'ai';
import { prepareRetries } from 'ai/internal';
import type { ProviderOptions } from './workflow-agent.js';
import {
  resolveSerializableTools,
  type SerializableToolDef,
} from './serializable-schema.js';

export type ModelCallStreamPart<TTools extends ToolSet = ToolSet> =
  | Experimental_LanguageModelStreamPart<TTools>
  | {
      type: 'tool-approval-request';
      approvalId: string;
      toolCallId: string;
      signature?: string;
    }
  | { type: 'reset-step' };

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
  timeoutAt?: number;
  headers?: Record<string, string | undefined>;
  reasoning?: LanguageModelV4CallOptions['reasoning'];
  providerOptions?: ProviderOptions;
  toolChoice?: ToolChoice<ToolSet>;
  includeRawChunks?: boolean;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
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
  providerMetadata?: SharedV4ProviderMetadata;
  title?: string;
  toolMetadata?: JSONObject;
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

export type DoStreamStepRawContentPart =
  | {
      type: 'text';
      text: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      type: 'file';
      data: string;
      mediaType: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | LanguageModelV4Source
  | {
      type: 'tool-call';
      toolCallIndex: number;
    };

/**
 * Compact callback replay data. The start event establishes the tool name for
 * a call, so delta events do not repeat it and available events reuse the
 * parsed input already present in `toolCalls`.
 */
export type ToolInputLifecycleEvent =
  | ['start', toolCallId: string, toolName: string]
  | ['delta', toolCallId: string, inputTextDelta: string]
  | ['available', toolCallId: string];

/**
 * Minimal aggregates needed to reconstruct a `StepResult` outside the step
 * boundary. By returning only these fields (instead of a fully-populated
 * StepResult plus the raw `chunks[]` array), the durable event log doesn't
 * carry StepResult's redundant derived fields — duplicate tool-call lists,
 * `text`, `files`, `sources`, `reasoningText`, or the tool-result arrays
 * populated after execution. It also avoids the per-chunk `chunks[]` snapshot
 * the iterator never reads. The caller reconstructs the full StepResult via
 * `buildStepResult`.
 */
export interface DoStreamStepRawResult {
  content: DoStreamStepRawContentPart[];
  reasoning: Array<{ text: string }>;
  responseMetadata?: { id?: string; timestamp?: Date; modelId?: string };
  warnings?: unknown[];
}

export type DoStreamStepResult =
  | { aborted: true }
  | {
      aborted?: false;
      toolCalls: ParsedToolCall[];
      finish: StreamFinish | undefined;
      raw: DoStreamStepRawResult;
      providerExecutedToolResults: Map<string, ProviderExecutedToolResult>;
      /**
       * Optional for compatibility with model-step results persisted before
       * tool input lifecycle callback replay was added.
       */
      toolInputLifecycleEvents?: ToolInputLifecycleEvent[];
      /** Present when the model stream emitted an error part. */
      terminalError?: unknown;
    };

export async function doStreamStep(
  conversationPrompt: LanguageModelV4Prompt,
  modelInit: LanguageModel,
  writable?: WritableStream<ModelCallStreamPart<ToolSet>>,
  serializedTools?: Record<string, SerializableToolDef>,
  options?: DoStreamStepOptions,
): Promise<DoStreamStepResult> {
  'use step';

  const timeout =
    options?.timeoutAt == null ? undefined : options.timeoutAt - Date.now();

  // AbortSignal.timeout(0) does not abort synchronously. Check the deadline
  // explicitly so an expired call never reaches the model, including when a
  // durable step is retried after the original timeout has elapsed.
  if (options?.abortSignal?.aborted || (timeout != null && timeout <= 0)) {
    return { aborted: true };
  }

  const abortSignal =
    timeout == null
      ? options?.abortSignal
      : options?.abortSignal == null
        ? AbortSignal.timeout(timeout)
        : AbortSignal.any([options.abortSignal, AbortSignal.timeout(timeout)]);

  // Resolve model inside step (must happen here for serialization boundary)
  const model: LanguageModel =
    typeof modelInit === 'string'
      ? gateway.languageModel(modelInit)
      : modelInit;

  // Reconstruct tools from serializable definitions with Ajv validation.
  // Tools are serialized before crossing the step boundary because zod schemas
  // contain functions that can't be serialized by the workflow runtime.
  const toolInputLifecycleEvents: ToolInputLifecycleEvent[] = [];
  const tools = serializedTools
    ? resolveSerializableTools(serializedTools)
    : undefined;

  // streamModelCall derives the model responseFormat from its output spec.
  // WorkflowAgent parses output outside the model-call helper, so this minimal
  // output spec only carries the responseFormat across the step boundary.
  const output =
    options?.responseFormat == null
      ? undefined
      : {
          name: 'workflow',
          responseFormat: Promise.resolve(options.responseFormat),
          async parseCompleteOutput() {
            throw new Error(
              'WorkflowAgent does not use streamModelCall output parsing.',
            );
          },
          async parsePartialOutput() {
            return undefined;
          },
          createElementStreamTransform() {
            return undefined;
          },
        };

  // streamModelCall handles prompt standardization, tool preparation,
  // model.doStream(), and stream part transformation. Retries are applied
  // around the model dispatch because streamModelCall itself does not retry.
  const { retry } = prepareRetries({
    maxRetries: options?.maxRetries,
    abortSignal,
  });
  const modelStream = await (async () => {
    try {
      const { stream } = await retry(() =>
        streamModelCall({
          model,
          // streamModelCall expects Prompt (ModelMessage[]) but we pass the
          // pre-converted LanguageModelV4Prompt. standardizePrompt inside
          // streamModelCall handles both formats.
          messages: conversationPrompt as unknown as ModelMessage[],
          allowSystemInMessages: true,
          tools,
          toolChoice: options?.toolChoice,
          includeRawChunks: options?.includeRawChunks,
          providerOptions: options?.providerOptions,
          abortSignal,
          headers: options?.headers,
          reasoning: options?.reasoning,
          output,
          maxOutputTokens: options?.maxOutputTokens,
          temperature: options?.temperature,
          topP: options?.topP,
          topK: options?.topK,
          presencePenalty: options?.presencePenalty,
          frequencyPenalty: options?.frequencyPenalty,
          stopSequences: options?.stopSequences,
          seed: options?.seed,
          repairToolCall: options?.repairToolCall,
        }),
      );

      return stream;
    } catch (error) {
      if (abortSignal?.aborted && isAbortError(error)) {
        return undefined;
      }

      throw error;
    }
  })();

  if (modelStream == null) {
    return { aborted: true };
  }

  // Consume the stream: capture data and write to writable in real-time
  const toolCalls: ParsedToolCall[] = [];
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  let finish: StreamFinish | undefined;

  // Minimal aggregation — only what buildStepResult needs outside the step.
  const content: DoStreamStepRawContentPart[] = [];
  const textPartIndexes = new Map<string, number>();
  const reasoningParts: Array<{ text: string }> = [];
  let responseMetadata:
    | { id?: string; timestamp?: Date; modelId?: string }
    | undefined;
  let warnings: unknown[] | undefined;
  let terminalError: unknown;
  let hasTerminalError = false;
  const ongoingToolCallToolNames = new Map<string, string>();

  // Acquire writer once before the loop to avoid per-chunk lock overhead
  const writer = writable?.getWriter();

  try {
    // A workflow step can be retried after already writing partial output.
    // Reset the current UI step before every attempt so a retry invalidates
    // chunks left behind by an earlier execution.
    await writer?.write({ type: 'reset-step' });

    for await (const part of modelStream) {
      switch (part.type) {
        case 'tool-input-start':
          ongoingToolCallToolNames.set(part.id, part.toolName);
          if (
            serializedTools?.[part.toolName]?.hasOnInputStart ||
            serializedTools?.[part.toolName]?.hasOnInputDelta ||
            serializedTools?.[part.toolName]?.hasOnInputAvailable
          ) {
            toolInputLifecycleEvents.push(['start', part.id, part.toolName]);
          }
          break;
        case 'tool-input-delta': {
          const toolName = ongoingToolCallToolNames.get(part.id);
          if (
            toolName != null &&
            serializedTools?.[toolName]?.hasOnInputDelta
          ) {
            toolInputLifecycleEvents.push(['delta', part.id, part.delta]);
          }
          break;
        }
        case 'text-start':
          upsertTextContentPart({
            content,
            textPartIndexes,
            id: part.id,
            providerMetadata: part.providerMetadata,
          });
          break;
        case 'text-delta':
          upsertTextContentPart({
            content,
            textPartIndexes,
            id: part.id,
            textDelta: part.text,
            providerMetadata: part.providerMetadata,
          });
          break;
        case 'text-end':
          upsertTextContentPart({
            content,
            textPartIndexes,
            id: part.id,
            providerMetadata: part.providerMetadata,
          });
          textPartIndexes.delete(part.id);
          break;
        case 'reasoning-delta':
          reasoningParts.push({ text: part.text });
          break;
        case 'file':
          content.push({
            type: 'file',
            data: part.file.base64,
            mediaType: part.file.mediaType,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        case 'source':
          content.push(part);
          break;
        case 'tool-call': {
          // parseToolCall adds dynamic/invalid/error at runtime
          const toolCallPart = part as typeof part & Partial<ParsedToolCall>;
          const toolCallIndex = toolCalls.length;
          const lifecycleToolName = ongoingToolCallToolNames.get(
            toolCallPart.toolCallId,
          );
          ongoingToolCallToolNames.delete(toolCallPart.toolCallId);
          if (
            lifecycleToolName != null &&
            serializedTools?.[lifecycleToolName]?.hasOnInputAvailable
          ) {
            toolInputLifecycleEvents.push([
              'available',
              toolCallPart.toolCallId,
            ]);
          }
          toolCalls.push({
            type: 'tool-call',
            toolCallId: toolCallPart.toolCallId,
            toolName: toolCallPart.toolName,
            input: toolCallPart.input,
            providerExecuted: toolCallPart.providerExecuted,
            providerMetadata: toolCallPart.providerMetadata,
            title: toolCallPart.title,
            toolMetadata: toolCallPart.toolMetadata,
            dynamic: toolCallPart.dynamic,
            invalid: toolCallPart.invalid,
            error: toolCallPart.error,
          });
          content.push({ type: 'tool-call', toolCallIndex });
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

      // Write to writable in real-time
      if (writer) {
        if (part.type === 'tool-approval-request') {
          await writer.write({
            type: 'tool-approval-request',
            approvalId: part.approvalId,
            toolCallId: part.toolCall.toolCallId,
            ...(part.signature != null ? { signature: part.signature } : {}),
          });
        } else {
          await writer.write(part);
        }
      }

      if (part.type === 'error' && !hasTerminalError) {
        // Retain the first model error as step data. Throwing here would make
        // the durable workflow runtime retry the model step and normalize the
        // original value before WorkflowAgent can surface it. Continue
        // consuming so the existing finish reason and usage are preserved.
        terminalError = part.error;
        hasTerminalError = true;
      }
    }
  } catch (error) {
    if (abortSignal?.aborted && isAbortError(error)) {
      return { aborted: true };
    }

    throw error;
  } finally {
    writer?.releaseLock();
  }

  if (
    abortSignal?.aborted ||
    (options?.timeoutAt != null && options.timeoutAt <= Date.now())
  ) {
    return { aborted: true };
  }

  return {
    toolCalls,
    finish,
    raw: {
      content,
      reasoning: reasoningParts,
      responseMetadata,
      warnings,
    },
    providerExecutedToolResults,
    toolInputLifecycleEvents,
    ...(hasTerminalError ? { terminalError } : {}),
  };
}

// Model-call retries are handled above so the workflow runtime must not add
// another retry layer around the durable step.
doStreamStep.maxRetries = 0;

function upsertTextContentPart({
  content,
  textPartIndexes,
  id,
  textDelta,
  providerMetadata,
}: {
  content: DoStreamStepRawContentPart[];
  textPartIndexes: Map<string, number>;
  id: string;
  textDelta?: string;
  providerMetadata?: SharedV4ProviderMetadata;
}) {
  let partIndex = textPartIndexes.get(id);

  if (partIndex == null) {
    partIndex =
      content.push({
        type: 'text',
        text: '',
        ...(providerMetadata != null ? { providerMetadata } : {}),
      }) - 1;
    textPartIndexes.set(id, partIndex);
  }

  const part = content[partIndex];

  if (part.type !== 'text') {
    throw new Error(`Expected text content at index ${partIndex}.`);
  }

  if (textDelta != null) {
    part.text += textDelta;
  }

  if (providerMetadata != null) {
    part.providerMetadata = providerMetadata;
  }
}
