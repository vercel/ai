import type { Arrayable, Context, ToolSet } from '@ai-sdk/provider-utils';
import type { GenerateTextOnStepFinishCallback } from '../generate-text/generate-text-events';
import type { Output } from '../generate-text/output';
import type { StreamTextTransform } from '../generate-text/stream-text';
import type { UIMessageStreamOptions } from '../generate-text/stream-text-result';
import type { TimeoutConfiguration } from '../prompt/request-options';
import { createUIMessageStreamResponse } from '../ui-message-stream';
import type { UIMessageStreamResponseInit } from '../ui-message-stream/ui-message-stream-response-init';
import type { InferUITools, UIMessage } from '../ui/ui-messages';
import type { Agent } from './agent';
import { createAgentUIStream } from './create-agent-ui-stream';

/**
 * Runs the agent and returns a response object with a UI message stream.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 * @param abortSignal - Abort signal. Optional.
 * @param timeout - Timeout in milliseconds. Optional.
 * @param options - The options for the agent. Optional.
 * @param experimental_transform - Stream transformations. Optional.
 * @param onStepFinish - Callback that is called when each step is finished. Optional.
 * @param headers - Additional headers for the response. Optional.
 * @param status - The status code for the response. Optional.
 * @param statusText - The status text for the response. Optional.
 * @param consumeSseStream - Whether to consume the SSE stream. Optional.
 *
 * @returns The response object.
 */
export async function createAgentUIStreamResponse<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
  MESSAGE_METADATA = unknown,
>({
  headers,
  status,
  statusText,
  consumeSseStream,
  ...options
}: {
  agent: Agent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  uiMessages: unknown[];
  abortSignal?: AbortSignal;
  timeout?: TimeoutConfiguration<TOOLS>;
  options?: CALL_OPTIONS;
  experimental_transform?: Arrayable<StreamTextTransform<TOOLS>>;
  onStepFinish?: GenerateTextOnStepFinishCallback<TOOLS>;
} & UIMessageStreamResponseInit &
  UIMessageStreamOptions<
    UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>
  >): Promise<Response> {
  return createUIMessageStreamResponse({
    headers,
    status,
    statusText,
    consumeSseStream,
    stream: await createAgentUIStream(options),
  });
}
