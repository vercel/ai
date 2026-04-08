import {
  getErrorMessage,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  SharedV4Headers,
} from '@ai-sdk/provider';
import type { ToolSet } from '@ai-sdk/provider-utils';
import {
  ModelMessage,
  ProviderOptions,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import { resolveLanguageModel } from '../model/resolve-model';
import { CallSettings, Prompt } from '../prompt';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareToolChoice } from '../prompt/prepare-tool-choice';
import { prepareTools } from '../prompt/prepare-tools';
import { standardizePrompt } from '../prompt/standardize-prompt';
import {
  CallWarning,
  FinishReason,
  LanguageModel,
  ToolChoice,
} from '../types/language-model';
import { ProviderMetadata } from '../types/provider-metadata';
import { asLanguageModelUsage, LanguageModelUsage } from '../types/usage';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { DownloadFunction } from '../util/download/download-function';
import { notify } from '../util/notify';
import { DefaultGeneratedFileWithType } from './generated-file';
import { Output } from './output';
import { parseToolCall } from './parse-tool-call';
import {
  TextStreamFilePart,
  TextStreamPart,
  TextStreamReasoningDeltaPart,
  TextStreamReasoningFilePart,
  TextStreamTextDeltaPart,
  TextStreamToolApprovalRequestPart,
  TextStreamToolCallPart,
  TextStreamToolErrorPart,
  TextStreamToolResultPart,
} from './stream-text-result';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { TypedToolError } from './tool-error';
import { TypedToolResult } from './tool-result';

export type LanguageModelStreamPart<TOOLS extends ToolSet = ToolSet> =
  | Exclude<
      TextStreamPart<TOOLS>,
      {
        type:
          | 'finish'
          | 'stream-start'
          | 'tool-output-denied'
          | 'start-step'
          | 'finish-step'
          | 'start'
          | 'abort';
      }
    >
  | TextStreamTextDeltaPart
  | TextStreamReasoningDeltaPart
  | TextStreamFilePart
  | TextStreamReasoningFilePart
  | TextStreamToolApprovalRequestPart<TOOLS>
  | TextStreamToolCallPart<TOOLS>
  | TextStreamToolResultPart<TOOLS>
  | TextStreamToolErrorPart<TOOLS>
  | {
      type: 'model-call-end';
      finishReason: FinishReason;
      rawFinishReason: string | undefined;
      usage: LanguageModelUsage;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'model-call-start';
      warnings: Array<CallWarning>;
    }
  | {
      type: 'model-call-response-metadata';

      /**
       * ID for the generated response, if the provider sends one.
       */
      id?: string;

      /**
       * Timestamp for the start of the generated response, if the provider sends one.
       */
      timestamp?: Date;

      /**
       * The ID of the response model that was used to generate the response, if the provider sends one.
       */
      modelId?: string;
    };

/**
 * Streams a single language model call after standardizing the prompt and tools.
 *
 * The returned stream emits model call parts together with request and response
 * metadata when available.
 *
 * @param model - The language model to use.
 * @param tools - Tools that are accessible to and can be called by the model. The model needs to support calling tools.
 * @param output - Output configuration that controls the response format requested from the model.
 * @param toolChoice - The tool choice strategy for the model call.
 *
 * @param system - A system message that will be part of the prompt.
 * @param prompt - A simple text prompt. You can either use `prompt` or `messages` but not both.
 * @param messages - A list of messages. You can either use `prompt` or `messages` but not both.
 *
 * @param maxOutputTokens - Maximum number of tokens to generate.
 * @param temperature - Temperature setting.
 * The value is passed through to the provider. The range depends on the provider and model.
 * It is recommended to set either `temperature` or `topP`, but not both.
 * @param topP - Nucleus sampling.
 * The value is passed through to the provider. The range depends on the provider and model.
 * It is recommended to set either `temperature` or `topP`, but not both.
 * @param topK - Only sample from the top K options for each subsequent token.
 * Used to remove "long tail" low probability responses.
 * Recommended for advanced use cases only. You usually only need to use temperature.
 * @param presencePenalty - Presence penalty setting.
 * It affects the likelihood of the model to repeat information that is already in the prompt.
 * The value is passed through to the provider. The range depends on the provider and model.
 * @param frequencyPenalty - Frequency penalty setting.
 * It affects the likelihood of the model to repeatedly use the same words or phrases.
 * The value is passed through to the provider. The range depends on the provider and model.
 * @param stopSequences - Stop sequences.
 * If set, the model will stop generating text when one of the stop sequences is generated.
 * @param seed - The seed (integer) to use for random sampling.
 * If set and supported by the model, calls will generate deterministic results.
 * @param reasoning - Reasoning configuration for the model call.
 *
 * @param download - A function that downloads URLs as part of prompt conversion.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param headers - Additional HTTP headers to be sent with the request.
 * @param includeRawChunks - Whether to include raw provider stream chunks in the model stream.
 * @param providerOptions - Additional provider-specific options.
 * @param repairToolCall - A function that can repair invalid tool calls before they are emitted.
 * @param onStart - A callback that receives the fully converted prompt before the model call starts.
 *
 * @returns A stream of model call parts together with request and response metadata when available.
 */
export async function streamLanguageModelCall<
  TOOLS extends ToolSet,
  OUTPUT extends Output = Output,
>({
  model,
  tools,
  output,
  toolChoice,
  prompt,
  system,
  messages,
  download,
  abortSignal,
  headers,
  includeRawChunks,
  providerOptions,
  repairToolCall,
  onStart,
  ...callSettings
}: {
  model: LanguageModel;
  tools?: TOOLS;
  output?: OUTPUT;
  toolChoice?: ToolChoice<TOOLS>;
  download?: DownloadFunction;
  headers?: Record<string, string | undefined>;
  includeRawChunks?: boolean;
  providerOptions?: ProviderOptions;
  repairToolCall?: ToolCallRepairFunction<TOOLS> | undefined;

  // onStart is currently required because the telemetry callbacks need
  // LanguageModelV4Prompt and we only want download URLs at most once.
  // Therefore convertToLanguageModelPrompt can only be called once
  // per step and the resulting LanguageModelV4Prompt needs to be
  // passed to the onStart callback.
  //
  // TODO explore decoupling by changing the telemetry callbacks to accept
  // a Prompt or a standardized Prompt.
  onStart?: (args: {
    promptMessages: LanguageModelV4Prompt;
  }) => Promise<void> | void;
} & Prompt &
  Omit<CallSettings, 'maxRetries'>): Promise<{
  stream: AsyncIterableStream<LanguageModelStreamPart<TOOLS>>;
  request?: {
    /**
     * Request HTTP body that was sent to the provider API.
     */
    body?: unknown;
  };
  response?: {
    /**
     * Response headers.
     */
    headers?: SharedV4Headers;
  };
}> {
  const resolvedModel = resolveLanguageModel(model);

  const standardizedPrompt = await standardizePrompt({
    system,
    prompt,
    messages,
  } as Prompt);

  const promptMessages = await convertToLanguageModelPrompt({
    prompt: {
      system: standardizedPrompt.system,
      messages: standardizedPrompt.messages,
    },
    supportedUrls: await resolvedModel.supportedUrls,
    download,
    provider: resolvedModel.provider.split('.')[0],
  });

  const stepTools = await prepareTools({
    tools,
  });

  const stepToolChoice = prepareToolChoice({
    toolChoice,
  });

  await notify({
    event: { promptMessages },
    callbacks: onStart,
  });

  const {
    stream: languageModelStream,
    response,
    request,
  } = await resolvedModel.doStream({
    ...callSettings,
    tools: stepTools,
    toolChoice: stepToolChoice,
    responseFormat: await output?.responseFormat,
    prompt: promptMessages,
    providerOptions,
    abortSignal,
    headers,
    includeRawChunks,
  });

  const standardizedStream = languageModelStream.pipeThrough(
    createLanguageModelV4StreamPartToLanguageModelStreamPartTransform({
      tools,
      system: standardizedPrompt.system,
      messages: standardizedPrompt.messages,
      repairToolCall,
    }),
  );

  return {
    stream: createAsyncIterableStream(standardizedStream),
    response,
    request,
  };
}

// Java Loves You.
function createLanguageModelV4StreamPartToLanguageModelStreamPartTransform<
  TOOLS extends ToolSet,
>({
  tools,
  system,
  messages,
  repairToolCall,
}: {
  tools: TOOLS | undefined;
  system: string | SystemModelMessage | Array<SystemModelMessage> | undefined;
  messages: ModelMessage[];
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
}) {
  // keep track of parsed tool calls so provider-emitted approval requests can reference them
  // keep track of tool inputs for provider-side tool results
  const toolCallsByToolCallId = new Map<string, TypedToolCall<TOOLS>>();

  return new TransformStream<
    LanguageModelV4StreamPart,
    LanguageModelStreamPart<TOOLS>
  >({
    async transform(chunk, controller) {
      switch (chunk.type) {
        case 'text-delta':
          controller.enqueue({
            type: 'text-delta',
            id: chunk.id,
            text: chunk.delta,
            providerMetadata: chunk.providerMetadata,
          });
          break;

        case 'reasoning-delta':
          controller.enqueue({
            type: 'reasoning-delta',
            id: chunk.id,
            text: chunk.delta,
            providerMetadata: chunk.providerMetadata,
          });
          break;

        case 'file':
        case 'reasoning-file': {
          controller.enqueue({
            type: chunk.type,
            file: new DefaultGeneratedFileWithType({
              data: chunk.data,
              mediaType: chunk.mediaType,
            }),
            providerMetadata: chunk.providerMetadata,
          });
          break;
        }

        case 'finish': {
          controller.enqueue({
            type: 'model-call-end',
            finishReason: chunk.finishReason.unified,
            rawFinishReason: chunk.finishReason.raw,
            usage: asLanguageModelUsage(chunk.usage),
            providerMetadata: chunk.providerMetadata,
          });
          break;
        }

        case 'tool-call': {
          try {
            const toolCall = await parseToolCall({
              toolCall: chunk,
              tools,
              repairToolCall,
              system,
              messages,
            });

            toolCallsByToolCallId.set(toolCall.toolCallId, toolCall);
            controller.enqueue(toolCall);

            if (toolCall.invalid) {
              controller.enqueue({
                type: 'tool-error',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
                error: getErrorMessage(toolCall.error!),
                dynamic: true,
                title: toolCall.title,
              });
              break;
            }
          } catch (error) {
            controller.enqueue({ type: 'error', error });
          }

          break;
        }

        case 'tool-approval-request': {
          const toolCall = toolCallsByToolCallId.get(chunk.toolCallId);

          if (toolCall == null) {
            controller.enqueue({
              type: 'error',
              error: new ToolCallNotFoundForApprovalError({
                toolCallId: chunk.toolCallId,
                approvalId: chunk.approvalId,
              }),
            });
            break;
          }

          controller.enqueue({
            type: 'tool-approval-request',
            approvalId: chunk.approvalId,
            toolCall,
          });
          break;
        }

        case 'tool-result': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          controller.enqueue(
            chunk.isError
              ? ({
                  type: 'tool-error',
                  toolCallId: chunk.toolCallId,
                  toolName,
                  input: toolCallsByToolCallId.get(chunk.toolCallId)?.input,
                  providerExecuted: true,
                  error: chunk.result,
                  dynamic: chunk.dynamic,
                  ...(chunk.providerMetadata != null
                    ? { providerMetadata: chunk.providerMetadata }
                    : {}),
                } as TypedToolError<TOOLS>)
              : ({
                  type: 'tool-result',
                  toolCallId: chunk.toolCallId,
                  toolName,
                  input: toolCallsByToolCallId.get(chunk.toolCallId)?.input,
                  output: chunk.result,
                  providerExecuted: true,
                  dynamic: chunk.dynamic,
                  ...(chunk.providerMetadata != null
                    ? { providerMetadata: chunk.providerMetadata }
                    : {}),
                } as TypedToolResult<TOOLS>),
          );

          break;
        }

        case 'tool-input-start': {
          const tool = tools?.[chunk.toolName];

          controller.enqueue({
            ...chunk,
            dynamic: chunk.dynamic ?? tool?.type === 'dynamic',
            title: tool?.title,
          });
          break;
        }

        case 'stream-start': {
          controller.enqueue({
            type: 'model-call-start',
            warnings: chunk.warnings,
          });
          break;
        }

        case 'response-metadata': {
          controller.enqueue({
            type: 'model-call-response-metadata',
            id: chunk.id,
            timestamp: chunk.timestamp,
            modelId: chunk.modelId,
          });
          break;
        }

        default:
          controller.enqueue(chunk);
          break;
      }
    },
  });
}
