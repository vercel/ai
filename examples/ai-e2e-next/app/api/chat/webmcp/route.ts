import { createMCPTools, MCPClientError } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';

export async function POST(request: Request) {
  const {
    messages,
    tools: definitions,
  }: { messages: UIMessage[]; tools: unknown } = await request.json();
  if (!Array.isArray(definitions) || definitions.length > 32) {
    return new Response('Invalid browser tool definitions', { status: 400 });
  }

  let tools: ReturnType<typeof createMCPTools>;
  try {
    tools = createMCPTools(definitions);
  } catch (error) {
    if (!MCPClientError.isInstance(error)) throw error;
    return new Response('Invalid browser tool definitions', { status: 400 });
  }
  const result = streamText({
    model: openai('gpt-6.2-astra'),
    instructions:
      'Help the user understand their shopping cart. Read the cart with the available tool before answering.',
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    abortSignal: request.signal,
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
