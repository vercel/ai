import type {
  Arrayable,
  Context,
  Experimental_SandboxSession as SandboxSession,
  Tool,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  GenerateTextOnStepEndCallback,
  GenerateTextOnStepFinishCallback,
} from '../generate-text/generate-text-events';
import type { Output } from '../generate-text/output';
import type { StreamTextTransform } from '../generate-text/stream-text';
import type { UIMessageStreamOptions } from '../generate-text/stream-text-result';
import type { TimeoutConfiguration } from '../prompt/request-options';
import type { InferUIMessageChunk } from '../ui-message-stream';
import type { UIMessageStreamOnStepEndCallback } from '../ui-message-stream/ui-message-stream-on-step-end-callback';
import { toUIMessageStream } from '../ui-message-stream/to-ui-message-stream';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import { resolveUIMessageCompaction } from '../ui/resolve-ui-message-compaction';
import type {
  InferUIMessageTools,
  InferUITools,
  UIMessage,
  UIDataTypes,
} from '../ui/ui-messages';
import {
  validateUIMessages,
  validateUIMessagesForAgent,
} from '../ui/validate-ui-messages';
import {
  createAsyncIterableStream,
  type AsyncIterableStream,
} from '../util/async-iterable-stream';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import type { Steering } from '../generate-text/steering';
import type { Agent } from './agent';
import { ToolLoopAgent } from './tool-loop-agent';
import type { CompactionCheckpoint } from '../compact-messages/types';

/**
 * UI stream options with separate generation and UI message step callbacks.
 */
export type AgentUIMessageStreamOptions<
  TOOLS extends ToolSet,
  UI_MESSAGE extends UIMessage,
> = Omit<UIMessageStreamOptions<UI_MESSAGE>, 'onStepEnd' | 'onStepFinish'> & {
  onStepEnd?: GenerateTextOnStepEndCallback<TOOLS>;
  /** @deprecated Use `onStepEnd` instead. */
  onStepFinish?: GenerateTextOnStepFinishCallback<TOOLS>;
  /**
   * Called after each step is converted to UI message parts.
   * Receives the accumulated UI message for inspection or persistence.
   */
  onUIMessageStepEnd?: UIMessageStreamOnStepEndCallback<UI_MESSAGE>;
};

/**
 * Runs the agent and stream the output as a UI message stream.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 * @param convertDataPart - Optional function to convert custom data parts to text or file model message parts.
 * @param abortSignal - The abort signal. Optional.
 * @param timeout - Timeout in milliseconds. Optional.
 * @param experimental_sandbox - The sandbox environment that is passed through to tool execution. Optional.
 * @param experimental_steering - A steering object that adds user messages to the run at the next step boundary. Only supported by `ToolLoopAgent`. Optional.
 * @param options - The options for the agent.
 * @param experimental_transform - The stream transformations. Optional.
 * @param onStepEnd - Callback that is called when each step ends. Optional.
 * @param onStepFinish - Deprecated alias for `onStepEnd`. Optional.
 * @param onUIMessageStepEnd - Callback with the accumulated UI message after each step. Optional.
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
  experimental_steering: steering,
  experimental_transform,
  onStepEnd,
  onStepFinish,
  onUIMessageStepEnd,
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
  experimental_steering?: Steering;
  options?: CALL_OPTIONS;
  experimental_transform?: Arrayable<StreamTextTransform<TOOLS>>;
  // TODO `originalMessages` is part of this for bc, omit in v7
} & AgentUIMessageStreamOptions<TOOLS, UI_MESSAGE>): Promise<
  AsyncIterableStream<InferUIMessageChunk<UI_MESSAGE>>
> {
  // other agents would ignore the steering object and never resolve its messages:
  if (steering != null && !(agent instanceof ToolLoopAgent)) {
    throw new InvalidArgumentError({
      parameter: 'experimental_steering',
      value: steering,
      message: 'Steering is only supported by ToolLoopAgent.',
    });
  }

  // Select compacted context before current tool schemas can reject or rewrite
  // historical tool parts that the record has already replaced.
  const hasCompaction =
    Array.isArray(uiMessages) &&
    uiMessages.some(
      message =>
        message != null &&
        typeof message === 'object' &&
        'parts' in message &&
        Array.isArray(message.parts) &&
        message.parts.some(
          part =>
            part != null &&
            typeof part === 'object' &&
            part.type === 'compaction',
        ),
    );
  const structuralMessages = hasCompaction
    ? await validateUIMessages<UI_MESSAGE>({ messages: uiMessages })
    : undefined;
  const projection =
    structuralMessages == null
      ? undefined
      : await resolveUIMessageCompaction<UI_MESSAGE>(structuralMessages);
  const appliedCompaction = projection?.appliedCompaction;

  const validatedMessages = await validateUIMessagesForAgent<UI_MESSAGE>({
    messages: appliedCompaction == null ? uiMessages : projection!.messages,
    // tools are compatible; the casting is required because the context param is
    // not available in ui messages
    tools: agent.tools as unknown as {
      [NAME in keyof InferUIMessageTools<UI_MESSAGE> & string]?: Tool<
        InferUIMessageTools<UI_MESSAGE>[NAME]['input'],
        InferUIMessageTools<UI_MESSAGE>[NAME]['output']
      >;
    },
  });

  let compactionCheckpoint: CompactionCheckpoint | undefined =
    appliedCompaction?.checkpoint;
  const remainingModelMessages = await convertToModelMessages(
    appliedCompaction == null
      ? validatedMessages
      : validatedMessages.map(message => ({
          ...message,
          // The full history was already projected. Do not resolve records a
          // second time relative to the shortened suffix.
          parts: message.parts.filter(part => part.type !== 'compaction'),
        })),
    {
      tools: agent.tools,
      convertDataPart,
      onCompactionApplied: compaction => {
        compactionCheckpoint = compaction.checkpoint;
      },
    },
  );
  const modelMessages =
    appliedCompaction == null
      ? remainingModelMessages
      : [...projection!.context, ...remainingModelMessages];

  const result = await agent.stream({
    prompt: modelMessages,
    ...(compactionCheckpoint != null ? { compactionCheckpoint } : {}),
    options: options as CALL_OPTIONS,
    abortSignal,
    timeout,
    experimental_sandbox: sandbox,
    experimental_steering: steering,
    experimental_transform,
    onStepEnd: onStepEnd ?? onStepFinish,
  });

  // TODO reading `originalMessages` is here for bc, always use `validatedMessages` in v7
  const originalMessages =
    uiMessageStreamOptions.originalMessages ??
    (appliedCompaction == null ? validatedMessages : structuralMessages!);

  return createAsyncIterableStream(
    toUIMessageStream({
      ...uiMessageStreamOptions,
      originalMessages,
      onStepEnd: onUIMessageStepEnd,
      stream: result.stream,
      tools: agent.tools,
    }),
  );
}
