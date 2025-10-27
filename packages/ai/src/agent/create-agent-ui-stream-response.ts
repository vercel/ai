import { UIMessageStreamOptions } from '../generate-text';
import { Output } from '../generate-text/output';
import { ToolSet } from '../generate-text/tool-set';
import { createUIMessageStreamResponse } from '../ui-message-stream';
import { UIMessageStreamResponseInit } from '../ui-message-stream/ui-message-stream-response-init';
import { InferUITools, UIMessage } from '../ui/ui-messages';
import { Agent } from './agent';
import { createAgentUIStream } from './create-agent-ui-stream';

/**
 * Runs the agent and returns a response object with a UI message stream.
 *
 * @param agent - The agent to run.
 * @param messages - The input UI messages.
 *
 * @returns The response object.
 */
export async function createAgentUIStreamResponse<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
  MESSAGE_METADATA = unknown,
>({
  headers,
  status,
  statusText,
  consumeSseStream,
  ...options
}: {
  agent: Agent<CALL_OPTIONS, TOOLS, OUTPUT>;
  messages: unknown[];
  options?: CALL_OPTIONS;
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
