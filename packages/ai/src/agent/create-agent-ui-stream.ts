import type {
  Arrayable,
  Context,
  Experimental_Sandbox as Sandbox,
  Tool,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { GenerateTextOnStepFinishCallback } from '../generate-text/generate-text-events';
import type { Output } from '../generate-text/output';
import type { StreamTextTransform } from '../generate-text/stream-text';
import type { UIMessageStreamOptions } from '../generate-text/stream-text-result';
import type { TimeoutConfiguration } from '../prompt/request-options';
import type { InferUIMessageChunk } from '../ui-message-stream';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import type {
  InferUIMessageTools,
  InferUITools,
  UIMessage,
} from '../ui/ui-messages';
import { validateUIMessages } from '../ui/validate-ui-messages';
import type { AsyncIterableStream } from '../util/async-iterable-stream';
import type { Agent } from './agent';

/**
 * Runs the agent and stream the output as a UI message stream.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 * @param abortSignal - The abort signal. Optional.
 * @param timeout - Timeout in milliseconds. Optional.
 * @param experimental_sandbox - The sandbox environment that is passed through to tool execution. Optional.
 * @param options - The options for the agent.
 * @param experimental_transform - The stream transformations. Optional.
 * @param onStepFinish - Callback that is called when each step is finished. Optional.
 *
 * @returns The UI message stream.
 */
export async function createAgentUIStream<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
  MESSAGE_METADATA = unknown,
>({
  agent,
  uiMessages,
  options,
  abortSignal,
  timeout,
  experimental_sandbox: sandbox,
  experimental_transform,
  onStepFinish,
  ...uiMessageStreamOptions
}: {
  agent: Agent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  uiMessages: unknown[];
  abortSignal?: AbortSignal;
  timeout?: TimeoutConfiguration<TOOLS>;
  experimental_sandbox?: Sandbox;
  options?: CALL_OPTIONS;
  experimental_transform?: Arrayable<StreamTextTransform<TOOLS>>;
  onStepFinish?: GenerateTextOnStepFinishCallback<TOOLS>;
  // TODO `originalMessages` is part of this for bc, omit in v7
} & UIMessageStreamOptions<
  UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>
>): Promise<
  AsyncIterableStream<
    InferUIMessageChunk<UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>>
  >
> {
  const validatedMessages = await validateUIMessages<
    UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>
  >({
    messages: uiMessages,
    // tools are compatible; the casting is required because the context param is
    // not available in ui messages
    tools: agent.tools as unknown as {
      [NAME in keyof InferUIMessageTools<
        UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>
      > &
        string]?: Tool<
        InferUIMessageTools<
          UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>
        >[NAME]['input'],
        InferUIMessageTools<
          UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>
        >[NAME]['output']
      >;
    },
  });

  const modelMessages = await convertToModelMessages(validatedMessages, {
    tools: agent.tools,
  });

  const result = await agent.stream({
    prompt: modelMessages,
    options: options as CALL_OPTIONS,
    abortSignal,
    timeout,
    experimental_sandbox: sandbox,
    experimental_transform,
    onStepFinish,
  });

  return result.toUIMessageStream({
    ...uiMessageStreamOptions,
    // TODO reading `originalMessages` is here for bc, always use `validatedMessages` in v7
    originalMessages:
      uiMessageStreamOptions.originalMessages ?? validatedMessages,
  });
}
