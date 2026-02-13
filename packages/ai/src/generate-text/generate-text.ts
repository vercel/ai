import {
  LanguageModelV3,
  LanguageModelV3Content,
  LanguageModelV3ToolCall,
} from '@ai-sdk/provider';
import {
  createIdGenerator,
  getErrorMessage,
  IdGenerator,
  ProviderOptions,
  ToolApprovalResponse,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { Tracer } from '@opentelemetry/api';
import { NoOutputGeneratedError } from '../error';
import { logWarnings } from '../logger/log-warnings';
import { resolveLanguageModel } from '../model/resolve-model';
import { ModelMessage } from '../prompt';
import {
  CallSettings,
  getStepTimeoutMs,
  getTotalTimeoutMs,
} from '../prompt/call-settings';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
import { prepareCallSettings } from '../prompt/prepare-call-settings';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { Prompt } from '../prompt/prompt';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { wrapGatewayError } from '../prompt/wrap-gateway-error';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { stringifyForTelemetry } from '../telemetry/stringify-for-telemetry';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import {
  LanguageModel,
  LanguageModelRequestMetadata,
  ToolChoice,
} from '../types';
import {
  addLanguageModelUsage,
  asLanguageModelUsage,
  LanguageModelUsage,
} from '../types/usage';
import { asArray } from '../util/as-array';
import { DownloadFunction } from '../util/download/download-function';
import { mergeObjects } from '../util/merge-objects';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import { collectToolApprovals } from './collect-tool-approvals';
import { ContentPart } from './content-part';
import { executeToolCall } from './execute-tool-call';
import { extractReasoningContent } from './extract-reasoning-content';
import { extractTextContent } from './extract-text-content';
import { GenerateTextResult } from './generate-text-result';
import { DefaultGeneratedFile } from './generated-file';
import { isApprovalNeeded } from './is-approval-needed';
import { Output, text } from './output';
import { InferCompleteOutput } from './output-utils';
import { parseToolCall } from './parse-tool-call';
import { PrepareStepFunction } from './prepare-step';
import { ResponseMessage } from './response-message';
import { DefaultStepResult, StepResult } from './step-result';
import {
  isStopConditionMet,
  stepCountIs,
  StopCondition,
} from './stop-condition';
import { toResponseMessages } from './to-response-messages';
import { ToolApprovalRequestOutput } from './tool-approval-request-output';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { TypedToolError } from './tool-error';
import { ToolOutput } from './tool-output';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';
import { mergeAbortSignals } from '../util/merge-abort-signals';

const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
  size: 24,
});

/**
 * Callback that is set using the `onStepFinish` option.
 *
 * @param stepResult - The result of the step.
 */
export type GenerateTextOnStepFinishCallback<TOOLS extends ToolSet> = (
  stepResult: StepResult<TOOLS>,
) => Promise<void> | void;

/**
 * Callback that is set using the `onFinish` option.
 *
 * @param event - The event that is passed to the callback.
 */
export type GenerateTextOnFinishCallback<TOOLS extends ToolSet> = (
  event: StepResult<TOOLS> & {
    /**
     * Details for all steps.
     */
    readonly steps: StepResult<TOOLS>[];

    /**
     * Total usage for all steps. This is the sum of the usage of all steps.
     */
    readonly totalUsage: LanguageModelUsage;

    /**
     * Context that is passed into tool execution.
     *
     * Experimental (can break in patch releases).
     *
     * @default undefined
     */
    experimental_context: unknown;
  },
) => PromiseLike<void> | void;

/**
 * Generate a text and call tools for a given prompt using a language model.
 *
 * This function does not stream the output. If you want to stream the output, use `streamText` instead.
 *
 * @param model - The language model to use.
 *
 * @param tools - Tools that are accessible to and can be called by the model. The model needs to support calling tools.
 * @param toolChoice - The tool choice strategy. Default: 'auto'.
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
 *
 * @param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param timeout - An optional timeout in milliseconds. The call will be aborted if it takes longer than the specified timeout.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 *
 * @param onStepFinish - Callback that is called when each step (LLM call) is finished, including intermediate steps.
 * @param onFinish - Callback that is called when all steps are finished and the response is complete.
 *
 * @returns
 * A result object that contains the generated text, the results of the tool calls, and additional information.
 */
export async function generateText<
  TOOLS extends ToolSet,
  OUTPUT extends Output = Output<string, string>,
>({
  model: modelArg,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries: maxRetriesArg,
  abortSignal,
  timeout,
  headers,
  stopWhen = stepCountIs(1),
  experimental_output,
  output = experimental_output,
  experimental_telemetry: telemetry,
  providerOptions,
  experimental_activeTools,
  activeTools = experimental_activeTools,
  experimental_prepareStep,
  prepareStep = experimental_prepareStep,
  experimental_repairToolCall: repairToolCall,
  experimental_download: download,
  experimental_context,
  experimental_include: include,
  _internal: { generateId = originalGenerateId } = {},
  onStepFinish,
  onFinish,
  ...settings
}: CallSettings &
  Prompt & {
    /**
     * The language model to use.
     */
    model: LanguageModel;

    /**
     * The tools that the model can call. The model needs to support calling tools.
     */
    tools?: TOOLS;

    /**
     * The tool choice strategy. Default: 'auto'.
     */
    toolChoice?: ToolChoice<NoInfer<TOOLS>>;

    /**
     * Condition for stopping the generation when there are tool results in the last step.
     * When the condition is an array, any of the conditions can be met to stop the generation.
     *
     * @default stepCountIs(1)
     */
    stopWhen?:
      | StopCondition<NoInfer<TOOLS>>
      | Array<StopCondition<NoInfer<TOOLS>>>;

    /**
     * Optional telemetry configuration (experimental).
     */
    experimental_telemetry?: TelemetrySettings;

    /**
     * Additional provider-specific options. They are passed through
     * to the provider from the AI SDK and enable provider-specific
     * functionality that can be fully encapsulated in the provider.
     */
    providerOptions?: ProviderOptions;

    /**
     * @deprecated Use `activeTools` instead.
     */
    experimental_activeTools?: Array<keyof NoInfer<TOOLS>>;

    /**
     * Limits the tools that are available for the model to call without
     * changing the tool call and result types in the result.
     */
    activeTools?: Array<keyof NoInfer<TOOLS>>;

    /**
     * Optional specification for parsing structured outputs from the LLM response.
     */
    output?: OUTPUT;

    /**
     * Optional specification for parsing structured outputs from the LLM response.
     *
     * @deprecated Use `output` instead.
     */
    experimental_output?: OUTPUT;

    /**
     * Custom download function to use for URLs.
     *
     * By default, files are downloaded if the model does not support the URL for the given media type.
     */
    experimental_download?: DownloadFunction | undefined;

    /**
     * @deprecated Use `prepareStep` instead.
     */
    experimental_prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

    /**
     * Optional function that you can use to provide different settings for a step.
     */
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

    /**
     * A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

    /**
     * Callback that is called when each step (LLM call) is finished, including intermediate steps.
     */
    onStepFinish?: GenerateTextOnStepFinishCallback<NoInfer<TOOLS>>;

    /**
     * Callback that is called when all steps are finished and the response is complete.
     */
    onFinish?: GenerateTextOnFinishCallback<NoInfer<TOOLS>>;

    /**
     * Context that is passed into tool execution.
     *
     * Experimental (can break in patch releases).
     *
     * @default undefined
     */
    experimental_context?: unknown;

    /**
     * Settings for controlling what data is included in step results.
     * Disabling inclusion can help reduce memory usage when processing
     * large payloads like images.
     *
     * By default, all data is included for backwards compatibility.
     */
    experimental_include?: {
      /**
       * Whether to retain the request body in step results.
       * The request body can be large when sending images or files.
       * @default true
       */
      requestBody?: boolean;

      /**
       * Whether to retain the response body in step results.
       * @default true
       */
      responseBody?: boolean;
    };

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: IdGenerator;
    };
  }): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
  const model = resolveLanguageModel(modelArg);
  const stopConditions = asArray(stopWhen);

  const totalTimeoutMs = getTotalTimeoutMs(timeout);
  const stepTimeoutMs = getStepTimeoutMs(timeout);
  const stepAbortController =
    stepTimeoutMs != null ? new AbortController() : undefined;
  const mergedAbortSignal = mergeAbortSignals(
    abortSignal,
    totalTimeoutMs != null ? AbortSignal.timeout(totalTimeoutMs) : undefined,
    stepAbortController?.signal,
  );

  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal: mergedAbortSignal,
  });

  const callSettings = prepareCallSettings(settings);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headersWithUserAgent,
    settings: { ...callSettings, maxRetries },
  });

  const initialPrompt = await standardizePrompt({
    system,
    prompt,
    messages,
  } as Prompt);

  const tracer = getTracer(telemetry);

  try {
    return await recordSpan({
      name: 'ai.generateText',
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: 'ai.generateText',
            telemetry,
          }),
          ...baseTelemetryAttributes,
          // model:
          'ai.model.provider': model.provider,
          'ai.model.id': model.modelId,
          // specific settings that only make sense on the outer level:
          'ai.prompt': {
            input: () => JSON.stringify({ system, prompt, messages }),
          },
        },
      }),
      tracer,
      fn: async span => {
        const initialMessages = initialPrompt.messages;
        const responseMessages: Array<ResponseMessage> = [];

        const { approvedToolApprovals, deniedToolApprovals } =
          collectToolApprovals<TOOLS>({ messages: initialMessages });

        const localApprovedToolApprovals = approvedToolApprovals.filter(
          toolApproval => !toolApproval.toolCall.providerExecuted,
        );

        if (
          deniedToolApprovals.length > 0 ||
          localApprovedToolApprovals.length > 0
        ) {
          const toolOutputs = await executeTools({
            toolCalls: localApprovedToolApprovals.map(
              toolApproval => toolApproval.toolCall,
            ),
            tools: tools as TOOLS,
            tracer,
            telemetry,
            messages: initialMessages,
            abortSignal: mergedAbortSignal,
            experimental_context,
          });

          const toolContent: Array<any> = [];

          // add regular tool results for approved tool calls:
          for (const output of toolOutputs) {
            const modelOutput = await createToolModelOutput({
              toolCallId: output.toolCallId,
              input: output.input,
              tool: tools?.[output.toolName],
              output:
                output.type === 'tool-result' ? output.output : output.error,
              errorMode: output.type === 'tool-error' ? 'json' : 'none',
            });

            toolContent.push({
              type: 'tool-result' as const,
              toolCallId: output.toolCallId,
              toolName: output.toolName,
              output: modelOutput,
            });
          }

          // add execution denied tool results for all denied tool approvals:
          for (const toolApproval of deniedToolApprovals) {
            toolContent.push({
              type: 'tool-result' as const,
              toolCallId: toolApproval.toolCall.toolCallId,
              toolName: toolApproval.toolCall.toolName,
              output: {
                type: 'execution-denied' as const,
                reason: toolApproval.approvalResponse.reason,
                // For provider-executed tools, include approvalId so provider can correlate
                ...(toolApproval.toolCall.providerExecuted && {
                  providerOptions: {
                    openai: {
                      approvalId: toolApproval.approvalResponse.approvalId,
                    },
                  },
                }),
              },
            });
          }

          responseMessages.push({
            role: 'tool',
            content: toolContent,
          });
        }

        // Forward provider-executed approval responses to the provider
        const providerExecutedToolApprovals = [
          ...approvedToolApprovals,
          ...deniedToolApprovals,
        ].filter(toolApproval => toolApproval.toolCall.providerExecuted);

        if (providerExecutedToolApprovals.length > 0) {
          responseMessages.push({
            role: 'tool',
            content: providerExecutedToolApprovals.map(
              toolApproval =>
                ({
                  type: 'tool-approval-response',
                  approvalId: toolApproval.approvalResponse.approvalId,
                  approved: toolApproval.approvalResponse.approved,
                  reason: toolApproval.approvalResponse.reason,
                  providerExecuted: true,
                }) satisfies ToolApprovalResponse,
            ),
          });
        }

        const callSettings = prepareCallSettings(settings);

        let currentModelResponse: Awaited<
          ReturnType<LanguageModelV3['doGenerate']>
        > & { response: { id: string; timestamp: Date; modelId: string } };
        let clientToolCalls: Array<TypedToolCall<TOOLS>> = [];
        let clientToolOutputs: Array<ToolOutput<TOOLS>> = [];
        const steps: GenerateTextResult<TOOLS, OUTPUT>['steps'] = [];

        // Track provider-executed tool calls that support deferred results
        // (e.g., code_execution in programmatic tool calling scenarios).
        // These tools may not return their results in the same turn as their call.
        const pendingDeferredToolCalls = new Map<
          string,
          { toolName: string }
        >();

        do {
          // Set up step timeout if configured
          const stepTimeoutId =
            stepTimeoutMs != null
              ? setTimeout(() => stepAbortController!.abort(), stepTimeoutMs)
              : undefined;

          try {
            const stepInputMessages = [...initialMessages, ...responseMessages];

            const prepareStepResult = await prepareStep?.({
              model,
              steps,
              stepNumber: steps.length,
              messages: stepInputMessages,
              experimental_context,
            });

            const stepModel = resolveLanguageModel(
              prepareStepResult?.model ?? model,
            );

            const promptMessages = await convertToLanguageModelPrompt({
              prompt: {
                system: prepareStepResult?.system ?? initialPrompt.system,
                messages: prepareStepResult?.messages ?? stepInputMessages,
              },
              supportedUrls: await stepModel.supportedUrls,
              download,
            });

            experimental_context =
              prepareStepResult?.experimental_context ?? experimental_context;

            const { toolChoice: stepToolChoice, tools: stepTools } =
              await prepareToolsAndToolChoice({
                tools,
                toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
                activeTools: prepareStepResult?.activeTools ?? activeTools,
              });

            currentModelResponse = await retry(() =>
              recordSpan({
                name: 'ai.generateText.doGenerate',
                attributes: selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    ...assembleOperationName({
                      operationId: 'ai.generateText.doGenerate',
                      telemetry,
                    }),
                    ...baseTelemetryAttributes,
                    // model:
                    'ai.model.provider': stepModel.provider,
                    'ai.model.id': stepModel.modelId,
                    // prompt:
                    'ai.prompt.messages': {
                      input: () => stringifyForTelemetry(promptMessages),
                    },
                    'ai.prompt.tools': {
                      // convert the language model level tools:
                      input: () => stepTools?.map(tool => JSON.stringify(tool)),
                    },
                    'ai.prompt.toolChoice': {
                      input: () =>
                        stepToolChoice != null
                          ? JSON.stringify(stepToolChoice)
                          : undefined,
                    },

                    // standardized gen-ai llm span attributes:
                    'gen_ai.system': stepModel.provider,
                    'gen_ai.request.model': stepModel.modelId,
                    'gen_ai.request.frequency_penalty':
                      settings.frequencyPenalty,
                    'gen_ai.request.max_tokens': settings.maxOutputTokens,
                    'gen_ai.request.presence_penalty': settings.presencePenalty,
                    'gen_ai.request.stop_sequences': settings.stopSequences,
                    'gen_ai.request.temperature':
                      settings.temperature ?? undefined,
                    'gen_ai.request.top_k': settings.topK,
                    'gen_ai.request.top_p': settings.topP,
                  },
                }),
                tracer,
                fn: async span => {
                  const stepProviderOptions = mergeObjects(
                    providerOptions,
                    prepareStepResult?.providerOptions,
                  );

                  const result = await stepModel.doGenerate({
                    ...callSettings,
                    tools: stepTools,
                    toolChoice: stepToolChoice,
                    responseFormat: await output?.responseFormat,
                    prompt: promptMessages,
                    providerOptions: stepProviderOptions,
                    abortSignal: mergedAbortSignal,
                    headers: headersWithUserAgent,
                  });

                  // Fill in default values:
                  const responseData = {
                    id: result.response?.id ?? generateId(),
                    timestamp: result.response?.timestamp ?? new Date(),
                    modelId: result.response?.modelId ?? stepModel.modelId,
                    headers: result.response?.headers,
                    body: result.response?.body,
                  };

                  // Add response information to the span:
                  span.setAttributes(
                    await selectTelemetryAttributes({
                      telemetry,
                      attributes: {
                        'ai.response.finishReason': result.finishReason.unified,
                        'ai.response.text': {
                          output: () => extractTextContent(result.content),
                        },
                        'ai.response.reasoning': {
                          output: () => extractReasoningContent(result.content),
                        },
                        'ai.response.toolCalls': {
                          output: () => {
                            const toolCalls = asToolCalls(result.content);
                            return toolCalls == null
                              ? undefined
                              : JSON.stringify(toolCalls);
                          },
                        },
                        'ai.response.id': responseData.id,
                        'ai.response.model': responseData.modelId,
                        'ai.response.timestamp':
                          responseData.timestamp.toISOString(),
                        'ai.response.providerMetadata': JSON.stringify(
                          result.providerMetadata,
                        ),

                        // TODO rename telemetry attributes to inputTokens and outputTokens
                        'ai.usage.promptTokens': result.usage.inputTokens.total,
                        'ai.usage.completionTokens':
                          result.usage.outputTokens.total,

                        // standardized gen-ai llm span attributes:
                        'gen_ai.response.finish_reasons': [
                          result.finishReason.unified,
                        ],
                        'gen_ai.response.id': responseData.id,
                        'gen_ai.response.model': responseData.modelId,
                        'gen_ai.usage.input_tokens':
                          result.usage.inputTokens.total,
                        'gen_ai.usage.output_tokens':
                          result.usage.outputTokens.total,
                      },
                    }),
                  );

                  return { ...result, response: responseData };
                },
              }),
            );

            // parse tool calls:
            const stepToolCalls: TypedToolCall<TOOLS>[] = await Promise.all(
              currentModelResponse.content
                .filter(
                  (part): part is LanguageModelV3ToolCall =>
                    part.type === 'tool-call',
                )
                .map(toolCall =>
                  parseToolCall({
                    toolCall,
                    tools,
                    repairToolCall,
                    system,
                    messages: stepInputMessages,
                  }),
                ),
            );
            const toolApprovalRequests: Record<
              string,
              ToolApprovalRequestOutput<TOOLS>
            > = {};

            // notify the tools that the tool calls are available:
            for (const toolCall of stepToolCalls) {
              if (toolCall.invalid) {
                continue; // ignore invalid tool calls
              }

              const tool = tools?.[toolCall.toolName];

              if (tool == null) {
                // ignore tool calls for tools that are not available,
                // e.g. provider-executed dynamic tools
                continue;
              }

              if (tool?.onInputAvailable != null) {
                await tool.onInputAvailable({
                  input: toolCall.input,
                  toolCallId: toolCall.toolCallId,
                  messages: stepInputMessages,
                  abortSignal: mergedAbortSignal,
                  experimental_context,
                });
              }

              if (
                await isApprovalNeeded({
                  tool,
                  toolCall,
                  messages: stepInputMessages,
                  experimental_context,
                })
              ) {
                toolApprovalRequests[toolCall.toolCallId] = {
                  type: 'tool-approval-request',
                  approvalId: generateId(),
                  toolCall,
                };
              }
            }

            // insert error tool outputs for invalid tool calls:
            // TODO AI SDK 6: invalid inputs should not require output parts
            const invalidToolCalls = stepToolCalls.filter(
              toolCall => toolCall.invalid && toolCall.dynamic,
            );

            clientToolOutputs = [];

            for (const toolCall of invalidToolCalls) {
              clientToolOutputs.push({
                type: 'tool-error',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
                error: getErrorMessage(toolCall.error!),
                dynamic: true,
              });
            }

            // execute client tool calls:
            clientToolCalls = stepToolCalls.filter(
              toolCall => !toolCall.providerExecuted,
            );

            if (tools != null) {
              clientToolOutputs.push(
                ...(await executeTools({
                  toolCalls: clientToolCalls.filter(
                    toolCall =>
                      !toolCall.invalid &&
                      toolApprovalRequests[toolCall.toolCallId] == null,
                  ),
                  tools,
                  tracer,
                  telemetry,
                  messages: stepInputMessages,
                  abortSignal: mergedAbortSignal,
                  experimental_context,
                })),
              );
            }

            // Track provider-executed tool calls that support deferred results.
            // In programmatic tool calling, a server tool (e.g., code_execution) may
            // trigger a client tool, and the server tool's result is deferred until
            // the client tool's result is sent back.
            for (const toolCall of stepToolCalls) {
              if (!toolCall.providerExecuted) continue;
              const tool = tools?.[toolCall.toolName];
              if (tool?.type === 'provider' && tool.supportsDeferredResults) {
                // Check if this tool call already has a result in the current response
                const hasResultInResponse = currentModelResponse.content.some(
                  part =>
                    part.type === 'tool-result' &&
                    part.toolCallId === toolCall.toolCallId,
                );
                if (!hasResultInResponse) {
                  pendingDeferredToolCalls.set(toolCall.toolCallId, {
                    toolName: toolCall.toolName,
                  });
                }
              }
            }

            // Mark deferred tool calls as resolved when we receive their results
            for (const part of currentModelResponse.content) {
              if (part.type === 'tool-result') {
                pendingDeferredToolCalls.delete(part.toolCallId);
              }
            }

            // content:
            const stepContent = asContent({
              content: currentModelResponse.content,
              toolCalls: stepToolCalls,
              toolOutputs: clientToolOutputs,
              toolApprovalRequests: Object.values(toolApprovalRequests),
              tools,
            });

            // append to messages for potential next step:
            responseMessages.push(
              ...(await toResponseMessages({
                content: stepContent,
                tools,
              })),
            );

            // Add step information (after response messages are updated):
            // Conditionally include request.body and response.body based on include settings.
            // Large payloads (e.g., base64-encoded images) can cause memory issues.
            const stepRequest: LanguageModelRequestMetadata =
              (include?.requestBody ?? true)
                ? (currentModelResponse.request ?? {})
                : { ...currentModelResponse.request, body: undefined };

            const stepResponse = {
              ...currentModelResponse.response,
              // deep clone msgs to avoid mutating past messages in multi-step:
              messages: structuredClone(responseMessages),
              // Conditionally include response body:
              body:
                (include?.responseBody ?? true)
                  ? currentModelResponse.response?.body
                  : undefined,
            };

            const currentStepResult: StepResult<TOOLS> = new DefaultStepResult({
              content: stepContent,
              finishReason: currentModelResponse.finishReason.unified,
              rawFinishReason: currentModelResponse.finishReason.raw,
              usage: asLanguageModelUsage(currentModelResponse.usage),
              warnings: currentModelResponse.warnings,
              providerMetadata: currentModelResponse.providerMetadata,
              request: stepRequest,
              response: stepResponse,
            });

            logWarnings({
              warnings: currentModelResponse.warnings ?? [],
              provider: stepModel.provider,
              model: stepModel.modelId,
            });

            steps.push(currentStepResult);
            await onStepFinish?.(currentStepResult);
          } finally {
            if (stepTimeoutId != null) {
              clearTimeout(stepTimeoutId);
            }
          }
        } while (
          // Continue if:
          // 1. There are client tool calls that have all been executed, OR
          // 2. There are pending deferred results from provider-executed tools
          ((clientToolCalls.length > 0 &&
            clientToolOutputs.length === clientToolCalls.length) ||
            pendingDeferredToolCalls.size > 0) &&
          // continue until a stop condition is met:
          !(await isStopConditionMet({ stopConditions, steps }))
        );

        // Add response information to the span:
        span.setAttributes(
          await selectTelemetryAttributes({
            telemetry,
            attributes: {
              'ai.response.finishReason':
                currentModelResponse.finishReason.unified,
              'ai.response.text': {
                output: () => extractTextContent(currentModelResponse.content),
              },
              'ai.response.reasoning': {
                output: () =>
                  extractReasoningContent(currentModelResponse.content),
              },
              'ai.response.toolCalls': {
                output: () => {
                  const toolCalls = asToolCalls(currentModelResponse.content);
                  return toolCalls == null
                    ? undefined
                    : JSON.stringify(toolCalls);
                },
              },
              'ai.response.providerMetadata': JSON.stringify(
                currentModelResponse.providerMetadata,
              ),

              // TODO rename telemetry attributes to inputTokens and outputTokens
              'ai.usage.promptTokens':
                currentModelResponse.usage.inputTokens.total,
              'ai.usage.completionTokens':
                currentModelResponse.usage.outputTokens.total,
            },
          }),
        );

        const lastStep = steps[steps.length - 1];

        const totalUsage = steps.reduce(
          (totalUsage, step) => {
            return addLanguageModelUsage(totalUsage, step.usage);
          },
          {
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          } as LanguageModelUsage,
        );

        await onFinish?.({
          finishReason: lastStep.finishReason,
          rawFinishReason: lastStep.rawFinishReason,
          usage: lastStep.usage,
          content: lastStep.content,
          text: lastStep.text,
          reasoningText: lastStep.reasoningText,
          reasoning: lastStep.reasoning,
          files: lastStep.files,
          sources: lastStep.sources,
          toolCalls: lastStep.toolCalls,
          staticToolCalls: lastStep.staticToolCalls,
          dynamicToolCalls: lastStep.dynamicToolCalls,
          toolResults: lastStep.toolResults,
          staticToolResults: lastStep.staticToolResults,
          dynamicToolResults: lastStep.dynamicToolResults,
          request: lastStep.request,
          response: lastStep.response,
          warnings: lastStep.warnings,
          providerMetadata: lastStep.providerMetadata,
          steps,
          totalUsage,
          experimental_context,
        });

        // parse output only if the last step was finished with "stop":
        let resolvedOutput;
        if (lastStep.finishReason === 'stop') {
          const outputSpecification = output ?? text();
          resolvedOutput = await outputSpecification.parseCompleteOutput(
            { text: lastStep.text },
            {
              response: lastStep.response,
              usage: lastStep.usage,
              finishReason: lastStep.finishReason,
            },
          );
        }

        return new DefaultGenerateTextResult({
          steps,
          totalUsage,
          output: resolvedOutput,
        });
      },
    });
  } catch (error) {
    throw wrapGatewayError(error);
  }
}

async function executeTools<TOOLS extends ToolSet>({
  toolCalls,
  tools,
  tracer,
  telemetry,
  messages,
  abortSignal,
  experimental_context,
}: {
  toolCalls: Array<TypedToolCall<TOOLS>>;
  tools: TOOLS;
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  experimental_context: unknown;
}): Promise<Array<ToolOutput<TOOLS>>> {
  const toolOutputs = await Promise.all(
    toolCalls.map(async toolCall =>
      executeToolCall({
        toolCall,
        tools,
        tracer,
        telemetry,
        messages,
        abortSignal,
        experimental_context,
      }),
    ),
  );

  return toolOutputs.filter(
    (output): output is NonNullable<typeof output> => output != null,
  );
}

class DefaultGenerateTextResult<TOOLS extends ToolSet, OUTPUT extends Output>
  implements GenerateTextResult<TOOLS, OUTPUT>
{
  readonly steps: GenerateTextResult<TOOLS, OUTPUT>['steps'];
  readonly totalUsage: LanguageModelUsage;
  private readonly _output: InferCompleteOutput<OUTPUT> | undefined;

  constructor(options: {
    steps: GenerateTextResult<TOOLS, OUTPUT>['steps'];
    output: InferCompleteOutput<OUTPUT> | undefined;
    totalUsage: LanguageModelUsage;
  }) {
    this.steps = options.steps;
    this._output = options.output;
    this.totalUsage = options.totalUsage;
  }

  private get finalStep() {
    return this.steps[this.steps.length - 1];
  }

  get content() {
    return this.finalStep.content;
  }

  get text() {
    return this.finalStep.text;
  }

  get files() {
    return this.finalStep.files;
  }

  get reasoningText() {
    return this.finalStep.reasoningText;
  }

  get reasoning() {
    return this.finalStep.reasoning;
  }

  get toolCalls() {
    return this.finalStep.toolCalls;
  }

  get staticToolCalls() {
    return this.finalStep.staticToolCalls;
  }

  get dynamicToolCalls() {
    return this.finalStep.dynamicToolCalls;
  }

  get toolResults() {
    return this.finalStep.toolResults;
  }

  get staticToolResults() {
    return this.finalStep.staticToolResults;
  }

  get dynamicToolResults() {
    return this.finalStep.dynamicToolResults;
  }

  get sources() {
    return this.finalStep.sources;
  }

  get finishReason() {
    return this.finalStep.finishReason;
  }

  get rawFinishReason() {
    return this.finalStep.rawFinishReason;
  }

  get warnings() {
    return this.finalStep.warnings;
  }

  get providerMetadata() {
    return this.finalStep.providerMetadata;
  }

  get response() {
    return this.finalStep.response;
  }

  get request() {
    return this.finalStep.request;
  }

  get usage() {
    return this.finalStep.usage;
  }

  get experimental_output() {
    return this.output;
  }

  get output() {
    if (this._output == null) {
      throw new NoOutputGeneratedError();
    }

    return this._output;
  }
}

function asToolCalls(content: Array<LanguageModelV3Content>) {
  const parts = content.filter(
    (part): part is LanguageModelV3ToolCall => part.type === 'tool-call',
  );

  if (parts.length === 0) {
    return undefined;
  }

  return parts.map(toolCall => ({
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
  }));
}

function asContent<TOOLS extends ToolSet>({
  content,
  toolCalls,
  toolOutputs,
  toolApprovalRequests,
  tools,
}: {
  content: Array<LanguageModelV3Content>;
  toolCalls: Array<TypedToolCall<TOOLS>>;
  toolOutputs: Array<ToolOutput<TOOLS>>;
  toolApprovalRequests: Array<ToolApprovalRequestOutput<TOOLS>>;
  tools: TOOLS | undefined;
}): Array<ContentPart<TOOLS>> {
  const contentParts: Array<ContentPart<TOOLS>> = [];

  for (const part of content) {
    switch (part.type) {
      case 'text':
      case 'reasoning':
      case 'source':
        contentParts.push(part);
        break;

      case 'file': {
        contentParts.push({
          type: 'file' as const,
          file: new DefaultGeneratedFile(part),
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        });
        break;
      }

      case 'tool-call': {
        contentParts.push(
          toolCalls.find(toolCall => toolCall.toolCallId === part.toolCallId)!,
        );
        break;
      }

      case 'tool-result': {
        const toolCall = toolCalls.find(
          toolCall => toolCall.toolCallId === part.toolCallId,
        );

        // Handle deferred results for provider-executed tools (e.g., programmatic tool calling).
        // When a server tool (like code_execution) triggers a client tool, the server tool's
        // result may be deferred to a later turn. In this case, there's no matching tool-call
        // in the current response.
        if (toolCall == null) {
          const tool = tools?.[part.toolName];
          const supportsDeferredResults =
            tool?.type === 'provider' && tool.supportsDeferredResults;

          if (!supportsDeferredResults) {
            throw new Error(`Tool call ${part.toolCallId} not found.`);
          }

          // Create tool result without tool call input (deferred result)
          if (part.isError) {
            contentParts.push({
              type: 'tool-error' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName as keyof TOOLS & string,
              input: undefined,
              error: part.result,
              providerExecuted: true,
              dynamic: part.dynamic,
            } as TypedToolError<TOOLS>);
          } else {
            contentParts.push({
              type: 'tool-result' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName as keyof TOOLS & string,
              input: undefined,
              output: part.result,
              providerExecuted: true,
              dynamic: part.dynamic,
            } as TypedToolResult<TOOLS>);
          }
          break;
        }

        if (part.isError) {
          contentParts.push({
            type: 'tool-error' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName as keyof TOOLS & string,
            input: toolCall.input,
            error: part.result,
            providerExecuted: true,
            dynamic: toolCall.dynamic,
          } as TypedToolError<TOOLS>);
        } else {
          contentParts.push({
            type: 'tool-result' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName as keyof TOOLS & string,
            input: toolCall.input,
            output: part.result,
            providerExecuted: true,
            dynamic: toolCall.dynamic,
          } as TypedToolResult<TOOLS>);
        }
        break;
      }

      case 'tool-approval-request': {
        const toolCall = toolCalls.find(
          toolCall => toolCall.toolCallId === part.toolCallId,
        );

        if (toolCall == null) {
          throw new ToolCallNotFoundForApprovalError({
            toolCallId: part.toolCallId,
            approvalId: part.approvalId,
          });
        }

        contentParts.push({
          type: 'tool-approval-request' as const,
          approvalId: part.approvalId,
          toolCall,
        });
        break;
      }
    }
  }

  return [...contentParts, ...toolOutputs, ...toolApprovalRequests];
}
