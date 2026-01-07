import { ServerResponse } from 'node:http';
import { StreamTextTransform, UIMessageStreamOptions } from '../generate-text';
import { Output } from '../generate-text/output';
import { ToolSet } from '../generate-text/tool-set';
import { TimeoutConfiguration } from '../prompt/call-settings';
import { pipeUIMessageStreamToResponse } from '../ui-message-stream';
import { UIMessageStreamResponseInit } from '../ui-message-stream/ui-message-stream-response-init';
import { InferUITools, UIMessage } from '../ui/ui-messages';
import { Agent } from './agent';
import { createAgentUIStream } from './create-agent-ui-stream';

/**
 * Pipes the agent UI message stream to a Node.js ServerResponse object.
 *
 * @param agent - The agent to run.
 * @param uiMessages - The input UI messages.
 */
export async function pipeAgentUIStreamToResponse<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
  MESSAGE_METADATA = unknown,
>({
  response,
  headers,
  status,
  statusText,
  consumeSseStream,
  ...options
}: {
  response: ServerResponse;
  agent: Agent<CALL_OPTIONS, TOOLS, OUTPUT>;
  uiMessages: unknown[];
  abortSignal?: AbortSignal;
  timeout?: TimeoutConfiguration;
  options?: CALL_OPTIONS;
  experimental_transform?:
    | StreamTextTransform<TOOLS>
    | Array<StreamTextTransform<TOOLS>>;
} & UIMessageStreamResponseInit &
  UIMessageStreamOptions<
    UIMessage<MESSAGE_METADATA, never, InferUITools<TOOLS>>
  >): Promise<void> {
  pipeUIMessageStreamToResponse({
    response,
    headers,
    status,
    statusText,
    consumeSseStream,
    stream: await createAgentUIStream(options),
  });
}
