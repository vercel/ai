import {
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4ToolCall,
} from '@ai-sdk/provider';
import type {
  Arrayable,
  Context,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import {
  asArray,
  createIdGenerator,
  getErrorMessage,
  IdGenerator,
  ProviderOptions,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { NoOutputGeneratedError } from '../error';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveLanguageModel } from '../model/resolve-model';
import { ModelMessage } from '../prompt';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
import { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import { prepareLanguageModelCallOptions } from '../prompt/prepare-language-model-call-options';
import { prepareToolChoice } from '../prompt/prepare-tool-choice';
import { prepareTools } from '../prompt/prepare-tools';
import { Prompt } from '../prompt/prompt';
import {
  getStepTimeoutMs,
  getTotalTimeoutMs,
  RequestOptions,
  TimeoutConfiguration,
} from '../prompt/request-options';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { wrapGatewayError } from '../prompt/wrap-gateway-error';
import { createUnifiedTelemetry } from '../telemetry/create-unified-telemetry';
import type { Telemetry } from '../telemetry/telemetry';
import { TelemetryOptions } from '../telemetry/telemetry-options';
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
import type { Callback } from '../util/callback';
import { DownloadFunction } from '../util/download/download-function';
import { mergeAbortSignals } from '../util/merge-abort-signals';
import { mergeObjects } from '../util/merge-objects';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import { collectToolApprovals } from './collect-tool-approvals';
import { ContentPart } from './content-part';
import type {
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
} from './core-events';
import { executeToolCall } from './execute-tool-call';
import { filterActiveTools } from './filter-active-tool';
import { GenerateTextResult } from './generate-text-result';
import { DefaultGeneratedFile } from './generated-file';
import { isToolApprovalNeeded } from './is-tool-approval-needed';
import { Output, text } from './output';
import { InferCompleteOutput } from './output-utils';
import { parseToolCall } from './parse-tool-call';
import { PrepareStepFunction } from './prepare-step';
import { convertToReasoningOutputs } from './reasoning-output';
import { ResponseMessage } from './response-message';
import { DefaultStepResult, StepResult } from './step-result';
import {
  isStepCount,
  isStopConditionMet,
  StopCondition,
} from './stop-condition';
import { toResponseMessages } from './to-response-messages';
import { ToolApprovalRequestOutput } from './tool-approval-request-output';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { TypedToolError } from './tool-error';
import { ToolNeedsApprovalConfiguration } from './tool-needs-approval-configuration';
import { ToolOutput } from './tool-output';
import { TypedToolResult } from './tool-result';
import { ToolsContextParameter } from './tools-context-parameter';
import {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from './tool-execution-events';

const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
  size: 24,
});

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/**
 * Callback that is set using the `experimental_onStart` option.
 *
 * Called when the generateText operation begins, before any LLM calls.
 * Use this callback for logging, analytics, or initializing state at the
 * start of a generation.
 *
 * @param event - The event object containing generation configuration.
 */
export type GenerateTextOnStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

/**
 * Callback that is set using the `experimental_onStepStart` option.
 *
 * Called when a step (LLM call) begins, before the provider is called.
 * Each step represents a single LLM invocation. Multiple steps occur when
 * using tool calls (the model may be called multiple times in a loop).
 *
 * @param event - The event object containing step configuration.
 */
export type GenerateTextOnStepStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStepStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

/**
 * Callback that is set using the `onStepFinish` option.
 *
 * Called when a step (LLM call) completes. The event includes all step result
 * properties (text, tool calls, usage, etc.) along with additional metadata.
 *
 * @param stepResult - The result of the step.
 */
export type GenerateTextOnStepFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<OnStepFinishEvent<TOOLS, RUNTIME_CONTEXT>>;

/**
 * Callback that is set using the `onFinish` option.
 *
 * Called when the entire generation completes (all steps finished).
 * The event includes the final step's result properties along with
 * aggregated data from all steps.
 *
 * @param event - The final result along with aggregated step data.
 */
export type GenerateTextOnFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<OnFinishEvent<TOOLS, RUNTIME_CONTEXT>>;

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
 * @param runtimeContext - User-defined runtime context that flows through the entire generation lifecycle.
 *
 * @param experimental_onStart - Callback invoked when generation begins, before any LLM calls.
 * @param experimental_onStepStart - Callback invoked when each step begins, before the provider is called.
 * Receives step number, messages (in ModelMessage format), tools, and runtimeContext.
 * @param experimental_onToolExecutionStart - Callback invoked before each tool execution begins.
 * Receives tool name, call ID, input, and context.
 * @param experimental_onToolExecutionEnd - Callback invoked after each tool execution completes.
 * Uses a discriminated union: check `success` to determine if `output` or `error` is present.
 * @param onStepFinish - Callback that is called when each step (LLM call) is finished, including intermediate steps.
 * @param onFinish - Callback that is called when all steps are finished and the response is complete.
 *
 * @returns
 * A result object that contains the generated text, the results of the tool calls, and additional information.
 */
export async function generateText<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
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
  stopWhen = isStepCount(1),
  output,
  toolNeedsApproval,
  experimental_telemetry,
  telemetry = experimental_telemetry,
  providerOptions,
  activeTools,
  prepareStep,
  experimental_repairToolCall: repairToolCall,
  experimental_download: download,
  runtimeContext = {} as RUNTIME_CONTEXT,
  toolsContext = {} as InferToolSetContext<TOOLS>,
  experimental_include: include,
  _internal: {
    generateId = originalGenerateId,
    generateCallId = originalGenerateCallId,
  } = {},
  experimental_onStart: onStart,
  experimental_onStepStart: onStepStart,
  experimental_onToolExecutionStart: onToolExecutionStart,
  experimental_onToolExecutionEnd: onToolExecutionEnd,
  onStepFinish,
  onFinish,
  ...settings
}: LanguageModelCallOptions &
  RequestOptions<TOOLS> &
  Prompt &
  ToolsContextParameter<TOOLS> & {
    /**
     * The language model to use.
     */
    model: LanguageModel;

    /**
     * The tool choice strategy. Default: 'auto'.
     */
    toolChoice?: ToolChoice<NoInfer<TOOLS>>;

    /**
     * Condition for stopping the generation when there are tool results in the last step.
     * When the condition is an array, any of the conditions can be met to stop the generation.
     *
     * @default isStepCount(1)
     */
    stopWhen?: Arrayable<StopCondition<NoInfer<TOOLS>, RUNTIME_CONTEXT>>;

    /**
     * Optional telemetry configuration.
     */
    telemetry?: TelemetryOptions;

    /**
     * Optional telemetry configuration.
     *
     * @deprecated Use `telemetry` instead. This alias will be removed in a future major release.
     */
    experimental_telemetry?: TelemetryOptions;

    /**
     * Additional provider-specific options. They are passed through
     * to the provider from the AI SDK and enable provider-specific
     * functionality that can be fully encapsulated in the provider.
     */
    providerOptions?: ProviderOptions;

    /**
     * Runtime context. Treat runtime context as immutable.
     * If you need to mutate runtime context, update it in `prepareStep`.
     */
    runtimeContext?: RUNTIME_CONTEXT;

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
     * Optional tool approval configuration.
     *
     * This configuration takes precedence over tool-defined approval settings.
     */
    toolNeedsApproval?: ToolNeedsApprovalConfiguration<TOOLS>;

    /**
     * Custom download function to use for URLs.
     *
     * By default, files are downloaded if the model does not support the URL for the given media type.
     */
    experimental_download?: DownloadFunction | undefined;

    /**
     * Optional function that you can use to provide different settings for a step.
     */
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>, RUNTIME_CONTEXT>;

    /**
     * A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

    /**
     * Callback that is called when the generateText operation begins,
     * before any LLM calls are made.
     */
    experimental_onStart?: GenerateTextOnStartCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>,
      NoInfer<OUTPUT>
    >;

    /**
     * Callback that is called when a step (LLM call) begins,
     * before the provider is called.
     */
    experimental_onStepStart?: GenerateTextOnStepStartCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>,
      NoInfer<OUTPUT>
    >;

    /**
     * Callback that is called right before a tool's execute function runs.
     */
    experimental_onToolExecutionStart?: OnToolExecutionStartCallback<
      NoInfer<TOOLS>
    >;

    /**
     * Callback that is called right after a tool's execute function completes (or errors).
     */
    experimental_onToolExecutionEnd?: OnToolExecutionEndCallback<
      NoInfer<TOOLS>
    >;

    /**
     * Callback that is called when each step (LLM call) is finished, including intermediate steps.
     */
    onStepFinish?: GenerateTextOnStepFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

    /**
     * Callback that is called when all steps are finished and the response is complete.
     */
    onFinish?: GenerateTextOnFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

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
      generateCallId?: IdGenerator;
    };
  }): Promise<GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>> {
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

  const callSettings = prepareLanguageModelCallOptions(settings);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const initialPrompt = await standardizePrompt({
    system,
    prompt,
    messages,
  } as Prompt);

  const callId = generateCallId();

  const unifiedTelemetry = createUnifiedTelemetry({
    telemetry,
  });

  await notify({
    event: {
      callId,
      operationId: 'ai.generateText',
      provider: model.provider,
      modelId: model.modelId,
      system,
      prompt,
      messages,
      tools,
      toolChoice,
      activeTools,
      maxOutputTokens: callSettings.maxOutputTokens,
      temperature: callSettings.temperature,
      topP: callSettings.topP,
      topK: callSettings.topK,
      presencePenalty: callSettings.presencePenalty,
      frequencyPenalty: callSettings.frequencyPenalty,
      stopSequences: callSettings.stopSequences,
      seed: callSettings.seed,
      reasoning: callSettings.reasoning,
      maxRetries,
      timeout,
      headers: headersWithUserAgent,
      providerOptions,
      stopWhen,
      output,
      runtimeContext,
      toolsContext,
    },
    callbacks: [
      onStart,
      unifiedTelemetry.onStart as
        | undefined
        | GenerateTextOnStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
    ],
  });

  try {
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
        callId,
        messages: initialMessages,
        abortSignal: mergedAbortSignal,
        timeout,
        toolsContext,
        stepNumber: 0,
        provider: model.provider,
        modelId: model.modelId,
        onToolExecutionStart: event =>
          notify({
            event,
            callbacks: [
              onToolExecutionStart,
              unifiedTelemetry.onToolExecutionStart as
                | undefined
                | OnToolExecutionStartCallback<TOOLS>,
            ],
          }),
        onToolExecutionEnd: event =>
          notify({
            event,
            callbacks: [
              onToolExecutionEnd,
              unifiedTelemetry.onToolExecutionEnd as
                | undefined
                | OnToolExecutionEndCallback<TOOLS>,
            ],
          }),
        executeToolInTelemetryContext: unifiedTelemetry.executeTool,
      });

      const toolContent: Array<any> = [];

      // add regular tool results for approved tool calls:
      for (const output of toolOutputs) {
        const modelOutput = await createToolModelOutput({
          toolCallId: output.toolCallId,
          input: output.input,
          tool: tools?.[output.toolName],
          output: output.type === 'tool-result' ? output.output : output.error,
          errorMode: output.type === 'tool-error' ? 'text' : 'none',
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

    const callSettings = prepareLanguageModelCallOptions(settings);

    let currentModelResponse: LanguageModelV4GenerateResult & {
      response: { id: string; timestamp: Date; modelId: string };
    };
    let clientToolCalls: Array<TypedToolCall<TOOLS>> = [];
    let clientToolOutputs: Array<ToolOutput<TOOLS>> = [];
    const steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps'] =
      [];

    // Track provider-executed tool calls that support deferred results
    // (e.g., code_execution in programmatic tool calling scenarios).
    // These tools may not return their results in the same turn as their call.
    const pendingDeferredToolCalls = new Map<string, { toolName: string }>();

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
          runtimeContext,
          toolsContext,
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
          provider: stepModel.provider.split('.')[0],
        });

        runtimeContext = prepareStepResult?.runtimeContext ?? runtimeContext;
        toolsContext = prepareStepResult?.toolsContext ?? toolsContext;

        const stepActiveTools = filterActiveTools({
          tools,
          activeTools: prepareStepResult?.activeTools ?? activeTools,
        });

        const stepTools = await prepareTools({
          tools: stepActiveTools,
        });

        const stepToolChoice = prepareToolChoice({
          toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
        });

        const stepMessages = prepareStepResult?.messages ?? stepInputMessages;

        const stepSystem = prepareStepResult?.system ?? initialPrompt.system;

        const stepProviderOptions = mergeObjects(
          providerOptions,
          prepareStepResult?.providerOptions,
        );

        await notify({
          event: {
            callId,
            stepNumber: steps.length,
            provider: stepModel.provider,
            modelId: stepModel.modelId,
            system: stepSystem,
            messages: stepMessages,
            tools,
            toolChoice: prepareStepResult?.toolChoice ?? toolChoice,
            activeTools: prepareStepResult?.activeTools ?? activeTools,
            steps: [...steps],
            providerOptions: stepProviderOptions,
            timeout,
            headers,
            stopWhen,
            output,
            runtimeContext,
            promptMessages,
            stepTools,
            stepToolChoice,
            toolsContext,
          },
          callbacks: [
            onStepStart,
            unifiedTelemetry.onStepStart as
              | undefined
              | GenerateTextOnStepStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
          ],
        });

        currentModelResponse = await retry(async () => {
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

          const responseData = {
            id: result.response?.id ?? generateId(),
            timestamp: result.response?.timestamp ?? new Date(),
            modelId: result.response?.modelId ?? stepModel.modelId,
            headers: result.response?.headers,
            body: result.response?.body,
          };

          return { ...result, response: responseData };
        });

        // parse tool calls:
        const stepToolCalls: TypedToolCall<TOOLS>[] = await Promise.all(
          currentModelResponse.content
            .filter(
              (part): part is LanguageModelV4ToolCall =>
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
              context: runtimeContext,
            });
          }

          if (
            await isToolApprovalNeeded({
              tools,
              toolNeedsApproval,
              toolCall,
              messages: stepInputMessages,
              toolsContext,
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
              callId,
              messages: stepInputMessages,
              abortSignal: mergedAbortSignal,
              timeout,
              toolsContext,
              stepNumber: steps.length,
              provider: stepModel.provider,
              modelId: stepModel.modelId,
              onToolExecutionStart: event =>
                notify({
                  event,
                  callbacks: [
                    onToolExecutionStart,
                    unifiedTelemetry.onToolExecutionStart as
                      | undefined
                      | OnToolExecutionStartCallback<TOOLS>,
                  ],
                }),
              onToolExecutionEnd: event =>
                notify({
                  event,
                  callbacks: [
                    onToolExecutionEnd,
                    unifiedTelemetry.onToolExecutionEnd as
                      | undefined
                      | OnToolExecutionEndCallback<TOOLS>,
                  ],
                }),
              executeToolInTelemetryContext: unifiedTelemetry.executeTool,
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

        const stepNumber = steps.length;

        const currentStepResult: StepResult<TOOLS, RUNTIME_CONTEXT> =
          new DefaultStepResult({
            callId,
            stepNumber,
            provider: stepModel.provider,
            modelId: stepModel.modelId,
            runtimeContext,
            content: stepContent,
            finishReason: currentModelResponse.finishReason.unified,
            rawFinishReason: currentModelResponse.finishReason.raw,
            usage: asLanguageModelUsage(currentModelResponse.usage),
            warnings: currentModelResponse.warnings,
            providerMetadata: currentModelResponse.providerMetadata,
            request: stepRequest,
            response: stepResponse,
            toolsContext,
          });

        logWarnings({
          warnings: currentModelResponse.warnings ?? [],
          provider: stepModel.provider,
          model: stepModel.modelId,
        });

        steps.push(currentStepResult);

        await notify({
          event: currentStepResult,
          callbacks: [
            onStepFinish,
            unifiedTelemetry.onStepFinish as
              | undefined
              | GenerateTextOnStepFinishCallback<TOOLS, RUNTIME_CONTEXT>,
          ],
        });
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

    const onFinishEvent = {
      callId,
      stepNumber: lastStep.stepNumber,
      model: lastStep.model,
      runtimeContext: lastStep.runtimeContext,
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
      toolsContext,
    };

    await notify({
      event: onFinishEvent,
      callbacks: [
        onFinish,
        unifiedTelemetry.onFinish as
          | undefined
          | GenerateTextOnFinishCallback<TOOLS, RUNTIME_CONTEXT>,
      ],
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
  } catch (error) {
    await unifiedTelemetry.onError?.({ callId, error });
    throw wrapGatewayError(error);
  }
}

async function executeTools<TOOLS extends ToolSet>({
  toolCalls,
  tools,
  callId,
  messages,
  abortSignal,
  timeout,
  toolsContext,
  stepNumber,
  provider,
  modelId,
  onToolExecutionStart,
  onToolExecutionEnd,
  executeToolInTelemetryContext,
}: {
  toolCalls: Array<TypedToolCall<TOOLS>>;
  tools: TOOLS;
  callId: string;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  timeout?: TimeoutConfiguration<TOOLS>;
  toolsContext: InferToolSetContext<TOOLS>;
  stepNumber: number;
  provider: string;
  modelId: string;
  onToolExecutionStart?: OnToolExecutionStartCallback<TOOLS>;
  onToolExecutionEnd?: OnToolExecutionEndCallback<TOOLS>;
  executeToolInTelemetryContext?: Telemetry['executeTool'];
}): Promise<Array<ToolOutput<TOOLS>>> {
  const toolOutputs = await Promise.all(
    toolCalls.map(async toolCall =>
      executeToolCall({
        toolCall,
        tools,
        callId,
        messages,
        abortSignal,
        timeout,
        toolsContext,
        stepNumber,
        provider,
        modelId,
        onToolExecutionStart,
        onToolExecutionEnd,
        executeToolInTelemetryContext,
      }),
    ),
  );

  return toolOutputs.filter(
    (output): output is NonNullable<typeof output> => output != null,
  );
}

class DefaultGenerateTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> implements GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  readonly steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps'];
  readonly totalUsage: LanguageModelUsage;
  private readonly _output: InferCompleteOutput<OUTPUT> | undefined;

  constructor(options: {
    steps: GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>['steps'];
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
    return convertToReasoningOutputs(this.finalStep.reasoning);
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

  get output() {
    if (this._output == null) {
      throw new NoOutputGeneratedError();
    }

    return this._output;
  }
}

function asContent<TOOLS extends ToolSet>({
  content,
  toolCalls,
  toolOutputs,
  toolApprovalRequests,
  tools,
}: {
  content: Array<LanguageModelV4Content>;
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
      case 'custom':
      case 'source':
        contentParts.push(part);
        break;

      case 'file':
      case 'reasoning-file': {
        contentParts.push({
          type: part.type as 'file' | 'reasoning-file',
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
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
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
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
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
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
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
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
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
