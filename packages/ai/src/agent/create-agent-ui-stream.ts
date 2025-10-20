import { UIMessageStreamOptions } from '../generate-text';
import { Output } from '../generate-text/output';
import { ToolSet } from '../generate-text/tool-set';
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
 * @param messages - The input UI messages.
 *
 * @returns The UI message stream.
 */
export async function createAgentUIStream<
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
  CALL_OPTIONS = never,
>({
  agent,
  messages,
  options,
  ...uiMessageStreamOptions
}: {
  agent: Agent<TOOLS, OUTPUT, CALL_OPTIONS>;
  messages: unknown[];
  options?: CALL_OPTIONS;
} & UIMessageStreamOptions<
  UIMessage<never, never, InferUITools<TOOLS>>
>): Promise<
  AsyncIterableStream<
    InferUIMessageChunk<UIMessage<never, never, InferUITools<TOOLS>>>
  >
> {
  const validatedMessages = await validateUIMessages<
    UIMessage<never, never, InferUITools<TOOLS>>
  >({
    messages,
    tools: agent.tools,
  });

  const modelMessages = convertToModelMessages(validatedMessages, {
    tools: agent.tools,
  });

  const result = agent.stream({ prompt: modelMessages, options });

  return result.toUIMessageStream(uiMessageStreamOptions);
}
