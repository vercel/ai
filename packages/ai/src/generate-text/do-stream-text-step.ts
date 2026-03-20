import {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FunctionTool,
  LanguageModelV4ProviderTool,
  LanguageModelV4ToolChoice,
  SharedV4Headers,
  SharedV4ProviderOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  createIdGenerator,
  ModelMessage,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { LanguageModelRequestMetadata } from '../types';
import { CallWarning, FinishReason } from '../types/language-model';
import { ProviderMetadata } from '../types/provider-metadata';
import {
  createNullLanguageModelUsage,
  LanguageModelUsage,
} from '../types/usage';
import { consumeStream } from '../util/consume-stream';
import { ContentPart } from './content-part';
import { UglyTransformedStreamTextPart } from './create-stream-text-part-transform';
import { modelCall } from './model-call';
import { DefaultStepResult, StepResult } from './step-result';
import { TextStreamPart } from './stream-text-result';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { ToolSet } from './tool-set';
import { toResponseMessages } from './to-response-messages';

const generateStepId = createIdGenerator({
  prefix: 'step',
  size: 24,
});

export type DoStreamTextStepOptions<TOOLS extends ToolSet> = {
  model: LanguageModelV4;
  tools?: TOOLS;
  callSettings: Omit<
    LanguageModelV4CallOptions,
    | 'prompt'
    | 'tools'
    | 'toolChoice'
    | 'responseFormat'
    | 'providerOptions'
    | 'abortSignal'
    | 'headers'
    | 'includeRawChunks'
  >;
  maxRetries?: number;

  // doStream options
  languageModelTools?: Array<
    LanguageModelV4FunctionTool | LanguageModelV4ProviderTool
  >;
  toolChoice?: LanguageModelV4ToolChoice;
  prompt: LanguageModelV4CallOptions['prompt'];
  providerOptions?: SharedV4ProviderOptions;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;

  // For createStreamTextPartTransform
  system?: string | SystemModelMessage | Array<SystemModelMessage>;
  messages: ModelMessage[];
  repairToolCall?: ToolCallRepairFunction<TOOLS>;

  // Step metadata
  callId: string;
  stepNumber: number;
};

export type DoStreamTextStepResult<TOOLS extends ToolSet> = {
  /**
   * A ReadableStream of TextStreamPart chunks for this step.
   * Includes start-step and finish-step markers.
   */
  stream: ReadableStream<TextStreamPart<TOOLS>>;

  /**
   * Promise that resolves to the StepResult once the stream is fully consumed.
   */
  stepResult: Promise<StepResult<TOOLS>>;

  /**
   * Promise that resolves to the tool calls made in this step.
   */
  toolCalls: Promise<TypedToolCall<TOOLS>[]>;

  /**
   * Request metadata from the model call.
   */
  request: LanguageModelRequestMetadata;

  /**
   * Response metadata (headers) from the model call.
   */
  response: { headers?: SharedV4Headers } | undefined;
};

export async function doStreamTextStep<TOOLS extends ToolSet>(
  options: DoStreamTextStepOptions<TOOLS>,
): Promise<DoStreamTextStepResult<TOOLS>> {
  const {
    model,
    tools,
    callSettings,
    maxRetries,
    languageModelTools,
    toolChoice,
    prompt,
    providerOptions,
    abortSignal,
    headers,
    system,
    messages,
    repairToolCall,
    callId,
    stepNumber,
  } = options;

  // Call modelCall to get the raw transformed stream
  const {
    stream: modelStream,
    request,
    response,
  } = await modelCall({
    model,
    callSettings,
    maxRetries,
    tools: languageModelTools,
    toolChoice,
    prompt,
    providerOptions,
    abortSignal,
    headers,
    userTools: tools,
    system,
    messages,
    repairToolCall,
  });

  // State for accumulating step data
  const stepToolCalls: TypedToolCall<TOOLS>[] = [];
  let warnings: SharedV4Warning[] | undefined;
  let stepFinishReason: FinishReason = 'other';
  let stepRawFinishReason: string | undefined = undefined;
  let stepUsage: LanguageModelUsage = createNullLanguageModelUsage();
  let stepProviderMetadata: ProviderMetadata | undefined;
  let stepFirstChunk = true;
  let stepResponse: { id: string; timestamp: Date; modelId: string } = {
    id: generateStepId(),
    timestamp: new Date(),
    modelId: model.modelId,
  };

  // Content accumulation for building StepResult
  let recordedContent: Array<ContentPart<TOOLS>> = [];
  const activeTextContent: Record<
    string,
    {
      type: 'text';
      text: string;
      providerMetadata: ProviderMetadata | undefined;
    }
  > = {};
  const activeReasoningContent: Record<
    string,
    {
      type: 'reasoning';
      text: string;
      providerMetadata: ProviderMetadata | undefined;
    }
  > = {};

  // Promises for aggregated results
  let resolveStepResult: (value: StepResult<TOOLS>) => void;
  let rejectStepResult: (error: unknown) => void;
  const stepResultPromise = new Promise<StepResult<TOOLS>>(
    (resolve, reject) => {
      resolveStepResult = resolve;
      rejectStepResult = reject;
    },
  );

  let resolveToolCalls: (value: TypedToolCall<TOOLS>[]) => void;
  const toolCallsPromise = new Promise<TypedToolCall<TOOLS>[]>(resolve => {
    resolveToolCalls = resolve;
  });

  // Transform UglyTransformedStreamTextPart → TextStreamPart
  // Also accumulate content for StepResult
  const transformedStream = modelStream.pipeThrough(
    new TransformStream<
      UglyTransformedStreamTextPart<TOOLS>,
      TextStreamPart<TOOLS>
    >({
      async transform(chunk, controller): Promise<void> {
        // Handle stream-start (warnings)
        if (chunk.type === 'stream-start') {
          warnings = chunk.warnings;
          return;
        }

        // Emit start-step on first real chunk
        if (stepFirstChunk) {
          stepFirstChunk = false;
          controller.enqueue({
            type: 'start-step',
            request: request ?? {},
            warnings: (warnings ?? []) as CallWarning[],
          });
        }

        const chunkType = chunk.type;
        switch (chunkType) {
          case 'text-start': {
            activeTextContent[chunk.id] = {
              type: 'text',
              text: '',
              providerMetadata: chunk.providerMetadata,
            };
            recordedContent.push(activeTextContent[chunk.id]);
            controller.enqueue(chunk);
            break;
          }

          case 'text-end': {
            const activeText = activeTextContent[chunk.id];
            if (activeText != null) {
              activeText.providerMetadata =
                chunk.providerMetadata ?? activeText.providerMetadata;
              delete activeTextContent[chunk.id];
            }
            controller.enqueue(chunk);
            break;
          }

          case 'text-delta': {
            const activeText = activeTextContent[chunk.id];
            if (activeText != null) {
              activeText.text += chunk.text;
              activeText.providerMetadata =
                chunk.providerMetadata ?? activeText.providerMetadata;
            }
            if (chunk.text.length > 0) {
              controller.enqueue(chunk);
            }
            break;
          }

          case 'reasoning-start': {
            activeReasoningContent[chunk.id] = {
              type: 'reasoning',
              text: '',
              providerMetadata: chunk.providerMetadata,
            };
            recordedContent.push(activeReasoningContent[chunk.id]);
            controller.enqueue(chunk);
            break;
          }

          case 'reasoning-end': {
            const activeReasoning = activeReasoningContent[chunk.id];
            if (activeReasoning != null) {
              activeReasoning.providerMetadata =
                chunk.providerMetadata ?? activeReasoning.providerMetadata;
              delete activeReasoningContent[chunk.id];
            }
            controller.enqueue(chunk);
            break;
          }

          case 'reasoning-delta': {
            const activeReasoning = activeReasoningContent[chunk.id];
            if (activeReasoning != null) {
              activeReasoning.text += chunk.text;
              activeReasoning.providerMetadata =
                chunk.providerMetadata ?? activeReasoning.providerMetadata;
            }
            controller.enqueue(chunk);
            break;
          }

          case 'tool-call': {
            recordedContent.push(chunk);
            stepToolCalls.push(chunk);
            controller.enqueue(chunk);
            break;
          }

          case 'tool-result': {
            if (!chunk.preliminary) {
              recordedContent.push(chunk);
            }
            controller.enqueue(chunk);
            break;
          }

          case 'tool-error': {
            recordedContent.push(chunk);
            controller.enqueue(chunk);
            break;
          }

          case 'tool-approval-request': {
            recordedContent.push(chunk);
            controller.enqueue(chunk);
            break;
          }

          case 'file':
          case 'reasoning-file': {
            recordedContent.push({
              type: chunk.type,
              file: chunk.file,
              ...(chunk.providerMetadata != null
                ? { providerMetadata: chunk.providerMetadata }
                : {}),
            });
            controller.enqueue(chunk);
            break;
          }

          case 'source': {
            recordedContent.push(chunk);
            controller.enqueue(chunk);
            break;
          }

          case 'custom': {
            recordedContent.push(chunk);
            controller.enqueue(chunk);
            break;
          }

          case 'tool-input-start':
          case 'tool-input-end':
          case 'tool-input-delta': {
            controller.enqueue(chunk);
            break;
          }

          case 'response-metadata': {
            stepResponse = {
              id: chunk.id ?? stepResponse.id,
              timestamp: chunk.timestamp ?? stepResponse.timestamp,
              modelId: chunk.modelId ?? stepResponse.modelId,
            };
            break;
          }

          case 'finish': {
            stepUsage = chunk.usage;
            stepFinishReason = chunk.finishReason;
            stepRawFinishReason = chunk.rawFinishReason;
            stepProviderMetadata = chunk.providerMetadata;
            break;
          }

          case 'error': {
            controller.enqueue(chunk);
            stepFinishReason = 'error';
            break;
          }

          case 'raw': {
            // raw chunks are not forwarded in this minimal version
            break;
          }

          default: {
            const exhaustiveCheck: never = chunkType;
            throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
          }
        }
      },

      async flush(controller) {
        // Emit finish-step
        controller.enqueue({
          type: 'finish-step',
          finishReason: stepFinishReason,
          rawFinishReason: stepRawFinishReason,
          usage: stepUsage,
          providerMetadata: stepProviderMetadata,
          response: {
            ...stepResponse,
            headers: response?.headers,
          },
        });

        // Resolve tool calls promise
        resolveToolCalls([...stepToolCalls]);

        // Build StepResult
        try {
          const stepMessages = await toResponseMessages({
            content: recordedContent,
            tools,
          });

          const stepResult: StepResult<TOOLS> = new DefaultStepResult({
            callId,
            stepNumber,
            provider: model.provider,
            modelId: model.modelId,
            functionId: undefined,
            metadata: undefined,
            experimental_context: undefined,
            content: recordedContent,
            finishReason: stepFinishReason,
            rawFinishReason: stepRawFinishReason,
            usage: stepUsage,
            warnings: (warnings ?? []) as CallWarning[],
            request: request ?? {},
            response: {
              ...stepResponse,
              headers: response?.headers,
              messages: stepMessages,
            },
            providerMetadata: stepProviderMetadata,
          });

          resolveStepResult(stepResult);
        } catch (error) {
          rejectStepResult(error);
        }
      },
    }),
  );

  // Tee the stream: one for the caller, one for background consumption
  // to ensure promises resolve even if the caller doesn't fully consume
  const [callerStream, backgroundStream] = transformedStream.tee();

  // Background-consume to ensure promises resolve
  consumeStream({
    stream: backgroundStream,
    onError: () => {
      // If background consumption fails, reject stepResult if not yet resolved
      rejectStepResult(
        new Error(
          'Stream consumption failed before step result could be built',
        ),
      );
    },
  });

  return {
    stream: callerStream,
    stepResult: stepResultPromise,
    toolCalls: toolCallsPromise,
    request: request ?? {},
    response,
  };
}
