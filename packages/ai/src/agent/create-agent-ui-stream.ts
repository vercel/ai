import {
  DelayedPromise,
  type Arrayable,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type Tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import {
  DefaultStepResult,
  type StepResult,
} from '../generate-text/step-result';
import type { Output } from '../generate-text/output';
import type { StreamTextTransform } from '../generate-text/stream-text';
import type { UIMessageStreamOptions } from '../generate-text/stream-text-result';
import type { TimeoutConfiguration } from '../prompt/request-options';
import type { InferUIMessageChunk } from '../ui-message-stream';
import { toUIMessageStream } from '../ui-message-stream/to-ui-message-stream';
import type { UIMessageStreamOnStepEndCallback } from '../ui-message-stream/ui-message-stream-on-step-end-callback';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import type {
  InferUIMessageTools,
  InferUITools,
  UIMessage,
  UIDataTypes,
} from '../ui/ui-messages';
import { validateUIMessagesForAgent } from '../ui/validate-ui-messages';
import {
  createAsyncIterableStream,
  type AsyncIterableStream,
} from '../util/async-iterable-stream';
import type { Agent } from './agent';
import type { Callback } from '../util/callback';
import { notify } from '../util/notify';

/**
 * Callback that receives the model step result and the accumulated UI message
 * after the step has been processed by the UI stream.
 */
export type AgentUIStreamOnStepEndCallback<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  UI_MESSAGE extends UIMessage,
> = Callback<
  StepResult<TOOLS, RUNTIME_CONTEXT> &
    Parameters<UIMessageStreamOnStepEndCallback<UI_MESSAGE>>[0]
>;

/**
 * Runs the agent and stream the output as a UI message stream.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 * @param convertDataPart - Optional function to convert custom data parts to text or file model message parts.
 * @param abortSignal - The abort signal. Optional.
 * @param timeout - Timeout in milliseconds. Optional.
 * @param experimental_sandbox - The sandbox environment that is passed through to tool execution. Optional.
 * @param options - The options for the agent.
 * @param experimental_transform - The stream transformations. Optional.
 * @param onStepEnd - Callback that receives the step result and accumulated UI message when each streamed step ends. Optional.
 * @param onStepFinish - Deprecated alias for `onStepEnd`. Optional.
 *
 * @returns The UI message stream.
 */
export async function createAgentUIStream<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
  MESSAGE_METADATA = unknown,
  UI_MESSAGE extends UIMessage<
    MESSAGE_METADATA,
    UIDataTypes,
    InferUITools<TOOLS>
  > = UIMessage<MESSAGE_METADATA, UIDataTypes, InferUITools<TOOLS>>,
>({
  agent,
  uiMessages,
  convertDataPart,
  options,
  abortSignal,
  timeout,
  experimental_sandbox: sandbox,
  experimental_transform,
  onStepEnd,
  onStepFinish,
  ...uiMessageStreamOptions
}: {
  agent: Agent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  uiMessages: unknown[];
  /**
   * Converts custom UI data parts to text or file model message parts.
   * Data parts are ignored when omitted or when the callback returns undefined.
   */
  convertDataPart?: NonNullable<
    Parameters<typeof convertToModelMessages<UI_MESSAGE>>[1]
  >['convertDataPart'];
  abortSignal?: AbortSignal;
  timeout?: TimeoutConfiguration<TOOLS>;
  experimental_sandbox?: SandboxSession;
  options?: CALL_OPTIONS;
  experimental_transform?: Arrayable<StreamTextTransform<TOOLS>>;
  onStepEnd?: AgentUIStreamOnStepEndCallback<
    TOOLS,
    RUNTIME_CONTEXT,
    UI_MESSAGE
  >;
  /** @deprecated Use `onStepEnd` instead. */
  onStepFinish?: AgentUIStreamOnStepEndCallback<
    TOOLS,
    RUNTIME_CONTEXT,
    UI_MESSAGE
  >;
  // TODO `originalMessages` is part of this for bc, omit in v7
} & UIMessageStreamOptions<UI_MESSAGE>): Promise<
  AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>
> {
  const validatedMessages = await validateUIMessagesForAgent<UI_MESSAGE>({
    messages: uiMessages,
    // tools are compatible; the casting is required because the context param is
    // not available in ui messages
    tools: agent.tools as unknown as {
      [NAME in keyof InferUIMessageTools<UI_MESSAGE> & string]?: Tool<
        InferUIMessageTools<UI_MESSAGE>[NAME]['input'],
        InferUIMessageTools<UI_MESSAGE>[NAME]['output']
      >;
    },
  });

  const modelMessages = await convertToModelMessages(validatedMessages, {
    tools: agent.tools,
    convertDataPart,
  });

  const resolvedOnStepEnd = onStepEnd ?? onStepFinish;
  const stepResults: StepResult<TOOLS, RUNTIME_CONTEXT>[] = [];
  let pendingStepResult:
    | DelayedPromise<StepResult<TOOLS, RUNTIME_CONTEXT>>
    | undefined;

  const result = await agent.stream({
    prompt: modelMessages,
    options: options as CALL_OPTIONS,
    abortSignal,
    timeout,
    experimental_sandbox: sandbox,
    experimental_transform,
    onStepEnd:
      resolvedOnStepEnd == null
        ? undefined
        : stepResult => {
            if (pendingStepResult != null) {
              pendingStepResult.resolve(stepResult);
              pendingStepResult = undefined;
            } else {
              stepResults.push(stepResult);
            }
          },
  });

  // TODO reading `originalMessages` is here for bc, always use `validatedMessages` in v7
  const originalMessages =
    uiMessageStreamOptions.originalMessages ?? validatedMessages;

  return createAsyncIterableStream(
    toUIMessageStream({
      ...uiMessageStreamOptions,
      originalMessages,
      stream: result.stream,
      tools: agent.tools,
      onStepEnd:
        resolvedOnStepEnd == null
          ? undefined
          : async uiEvent => {
              // A finish-step chunk can reach the UI stream before the agent
              // has notified its step callbacks. Never wait in the agent
              // callback: doing so would block the stream that builds the UI message.
              const stepResult =
                stepResults.shift() ??
                (await (pendingStepResult = new DelayedPromise<
                  StepResult<TOOLS, RUNTIME_CONTEXT>
                >()).promise);

              // Use a separate step result to retain its getters without adding
              // UI fields to the agent's own recorded steps and callback events.
              const event = Object.assign(
                new DefaultStepResult({
                  callId: stepResult.callId,
                  stepNumber: stepResult.stepNumber,
                  provider: stepResult.model.provider,
                  modelId: stepResult.model.modelId,
                  runtimeContext: stepResult.runtimeContext,
                  toolsContext: stepResult.toolsContext,
                  content: stepResult.content,
                  finishReason: stepResult.finishReason,
                  rawFinishReason: stepResult.rawFinishReason,
                  usage: stepResult.usage,
                  performance: stepResult.performance,
                  warnings: stepResult.warnings,
                  request: stepResult.request,
                  response: stepResult.response,
                  providerMetadata: stepResult.providerMetadata,
                }),
                uiEvent,
              );

              await notify({ event, callbacks: resolvedOnStepEnd });
            },
    }),
  );
}
