import { ToolSet } from '../generate-text/tool-set';
import { convertToModelMessages } from '../ui/convert-to-model-messages';
import { InferUITools, UIMessage } from '../ui/ui-messages';
import { validateUIMessages } from '../ui/validate-ui-messages';
import { Agent } from './agent';

/**
 * Runs the agent and stream the output as a UI message stream
 * in the response body.
 *
 * @param agent - The agent to run.
 * @param messages - The input UI messages.
 *
 * @returns The response object.
 */
export async function createAgentStreamResponse<
  TOOLS extends ToolSet = {},
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
>({
  agent,
  messages,
}: {
  agent: Agent<TOOLS, OUTPUT, OUTPUT_PARTIAL>;
  messages: unknown[];
}): Promise<Response> {
  const validatedMessages = await validateUIMessages<
    UIMessage<never, never, InferUITools<TOOLS>>
  >({
    messages,
    tools: agent.tools,
  });

  const modelMessages = convertToModelMessages(validatedMessages, {
    tools: agent.tools,
  });

  return agent
    .stream({ prompt: modelMessages })
    .toUIMessageStreamResponse<UIMessage<never, never, InferUITools<TOOLS>>>();
}
