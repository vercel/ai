import type {
  Arrayable,
  Context,
  Experimental_SandboxSession as SandboxSession,
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
import { createUIMessageStreamResponse } from '../ui-message-stream';
import type { UIMessageStreamResponseInit } from '../ui-message-stream/ui-message-stream-response-init';
import type { InferUITools, UIMessage, UIDataTypes } from '../ui/ui-messages';
import type { Agent } from './agent';
import type { convertToModelMessages } from '../ui/convert-to-model-messages';
import { createAgentUIStream } from './create-agent-ui-stream';

/**
 * Runs the agent and returns a response object with a UI message stream.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 * @param convertDataPart - Optional function to convert custom data parts to text or file model message parts.
 * @param abortSignal - Abort signal. Optional.
 * @param timeout - Timeout in milliseconds. Optional.
 * @param experimental_sandbox - The sandbox environment that is passed through to tool execution. Optional.
 * @param options - The options for the agent. Optional.
 * @param experimental_transform - Stream transformations. Optional.
 * @param onStepEnd - Callback that is called when each step ends. Optional.
 * @param onStepFinish - Deprecated alias for `onStepEnd`. Optional.
 * @param headers - Additional headers for the response. Optional.
 * @param status - The status code for the response. Optional.
 * @param statusText - The status text for the response. Optional.
 * @param keepAliveMs - Optional interval for sending SSE keep-alive comments.
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
  UI_MESSAGE extends UIMessage<
    MESSAGE_METADATA,
    UIDataTypes,
    InferUITools<TOOLS>
  > = UIMessage<MESSAGE_METADATA, UIDataTypes, InferUITools<TOOLS>>,
>({
  headers,
  status,
  statusText,
  keepAliveMs,
  consumeSseStream,
  ...options
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
  onStepEnd?: GenerateTextOnStepEndCallback<TOOLS>;
  /** @deprecated Use `onStepEnd` instead. */
  onStepFinish?: GenerateTextOnStepFinishCallback<TOOLS>;
} & UIMessageStreamResponseInit &
  UIMessageStreamOptions<UI_MESSAGE>): Promise<Response> {
  return createUIMessageStreamResponse({
    headers,
    status,
    statusText,
    keepAliveMs,
    consumeSseStream,
    stream: await createAgentUIStream(options),
  });
}
