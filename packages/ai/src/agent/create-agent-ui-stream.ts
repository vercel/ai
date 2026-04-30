import type {
  StreamTextTransform,
  UIMessageStreamOptions,
} from '../generate-text';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import type { TimeoutConfiguration } from '../prompt/call-settings';
import type { InferUIMessageChunk } from '../ui-message-stream';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import type { InferUITools, UIMessage } from '../ui/ui-messages';
import { validateUIMessages } from '../ui/validate-ui-messages';
import type { AsyncIterableStream } from '../util/async-iterable-stream';
import type { Agent } from './agent';
import type { ToolLoopAgentOnStepFinishCallback } from './tool-loop-agent-settings';

/**
 * Runs the agent and stream the output as a UI message stream.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 * @param abortSignal - The abort signal. Optional.
 * @param timeout - Timeout in milliseconds. Optional.
 * @param options - The options for the agent.
 * @param experimental_transform - The stream transformations. Optional.
 * @param onStepFinish - Callback that is called when each step is finished. Optional.
 *
 * @returns The UI message stream.
 */
export async function createAgentUIStream<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
  MESSAGE_METADATA = unknown,
>({
  agent,
  uiMessages,
  options,
  abortSignal,
  timeout,
  experimental_transform,
  onStepFinish,
  ...uiMessageStreamOptions
}: {
  agent: Agent<CALL_OPTIONS, TOOLS, OUTPUT>;
  uiMessages: unknown[];
  abortSignal?: AbortSignal;
  timeout?: TimeoutConfiguration;
  options?: CALL_OPTIONS;
  experimental_transform?:
    | StreamTextTransform<TOOLS>
    | Array<StreamTextTransform<TOOLS>>;
  onStepFinish?: ToolLoopAgentOnStepFinishCallback<TOOLS>;
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
    tools: agent.tools,
  });

  const modelMessages = await convertToModelMessages(validatedMessages, {
    tools: agent.tools,
  });

  const result = await agent.stream({
    prompt: modelMessages,
    options: options as CALL_OPTIONS,
    abortSignal,
    timeout,
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
