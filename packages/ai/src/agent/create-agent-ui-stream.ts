import { UIMessageStreamOptions } from '../generate-text';
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
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
>({
  agent,
  messages,
  ...uiMessageStreamOptions
}: {
  agent: Agent<TOOLS, OUTPUT, OUTPUT_PARTIAL>;
  messages: unknown[];
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

  const result = agent.stream({ prompt: modelMessages });

  return result.toUIMessageStream(uiMessageStreamOptions);
}
