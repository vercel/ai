import { StreamTextTransform, UIMessageStreamOptions } from '../generate-text';
import { Output } from '../generate-text/output';
import { ToolSet } from '../generate-text/tool-set';
import { TimeoutConfiguration } from '../prompt/call-settings';
import { InferUIMessageChunk } from '../ui-message-stream';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import { InferUITools, UIMessage } from '../ui/ui-messages';
import { validateUIMessages } from '../ui/validate-ui-messages';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { Agent } from './agent';

/**
 * Runs the agent and stream the output as a UI message stream.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 * @param abortSignal - The abort signal. Optional.
 * @param timeout - Timeout in milliseconds. Optional.
 * @param options - The options for the agent.
 * @param experimental_transform - The stream transformations. Optional.
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
  });

  return result.toUIMessageStream(uiMessageStreamOptions);
}
