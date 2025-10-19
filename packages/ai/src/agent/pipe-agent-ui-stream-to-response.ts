import { ServerResponse } from 'node:http';
import { UIMessageStreamOptions } from '../generate-text';
import { ToolSet } from '../generate-text/tool-set';
import { pipeUIMessageStreamToResponse } from '../ui-message-stream';
import { UIMessageStreamResponseInit } from '../ui-message-stream/ui-message-stream-response-init';
import { InferUITools, UIMessage } from '../ui/ui-messages';
import { Agent } from './agent';
import { createAgentUIStream } from './create-agent-ui-stream';

/**
 * Pipes the agent UI message stream to a Node.js ServerResponse object.
 *
 * @param agent - The agent to run.
 * @param messages - The input UI messages.
 */
export async function pipeAgentUIStreamToResponse<
  TOOLS extends ToolSet = {},
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
>({
  response,
  headers,
  status,
  statusText,
  consumeSseStream,
  ...options
}: {
  response: ServerResponse;
  agent: Agent<TOOLS, OUTPUT, OUTPUT_PARTIAL>;
  messages: unknown[];
} & UIMessageStreamResponseInit &
  UIMessageStreamOptions<
    UIMessage<never, never, InferUITools<TOOLS>>
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
