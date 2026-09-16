import type {
  LanguageModelV4Prompt,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { isAbortError } from '@ai-sdk/provider-utils';
import {
  experimental_streamLanguageModelCall as streamModelCall,
  gateway,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { prepareRetries } from 'ai/internal';
import {
  resolveSerializableTools,
  type SerializableToolDef,
} from './serializable-schema.js';

import type {
  ModelCallFinish as StreamFinish,
  ModelCallOptions as DoStreamStepOptions,
  ModelCallRawContentPart as DoStreamStepRawContentPart,
  ModelCallResult as DoStreamStepResult,
  ModelCallStreamPart,
  ParsedToolCall,
  ProviderExecutedToolResult,
  ToolInputLifecycleEvent,
} from './model-call.js';

// Preserve existing imports while the durable step keeps its name and payload.
export type {
  ModelCallFinish as StreamFinish,
  ModelCallOptions as DoStreamStepOptions,
  ModelCallRawContentPart as DoStreamStepRawContentPart,
  ModelCallRawResult as DoStreamStepRawResult,
  ModelCallResult as DoStreamStepResult,
  ModelCallStreamPart,
  ModelStopCondition,
  ParsedToolCall,
  ProviderExecutedToolResult,
  ToolInputLifecycleEvent,
} from './model-call.js';

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
          messages: conversationPrompt.map(message =>
            message.role !== 'tool'
              ? message
              : {
                  ...message,
                  // Provider prompt approval responses have already been filtered by
                  // convertToLanguageModelPrompt. Restore the marker expected by the
                  // model-call helper when it converts these messages again.
                  content: message.content.map(part =>
                    part.type === 'tool-approval-response'
                      ? { ...part, providerExecuted: true }
                      : part,
                  ),
                },
          ) as unknown as ModelMessage[],
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
        case 'tool-approval-request':
          content.push({
            type: 'tool-approval-request',
            approvalId: part.approvalId,
            toolCallId: part.toolCall.toolCallId,
          });
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
              dynamic: part.dynamic,
              providerMetadata: part.providerMetadata,
            });
            content.push({
              type: 'provider-tool-result',
              toolCallId: part.toolCallId,
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
              dynamic: errorPart.dynamic,
              providerMetadata: errorPart.providerMetadata,
            });
            content.push({
              type: 'provider-tool-result',
              toolCallId: errorPart.toolCallId,
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
