import { createMCPTools, MCPClientError } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from 'ai';
import { isLocalDevelopmentRequest } from '../../code-execution-files/is-local-development-request';

export async function POST(request: Request) {
  if (!isLocalDevelopmentRequest(request)) {
    return new Response('WebMCP is only available in local development.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const {
    messages,
    tools: definitions,
  }: { messages: unknown; tools: unknown } = await request.json();
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

  const validatedMessages = await safeValidateUIMessages({ messages, tools });
  // This chat needs only text and browser tool results. Reject attachments
  // before message conversion can pass URLs to the model's file downloader.
  if (
    !validatedMessages.success ||
    validatedMessages.data.some(
      message =>
        (message.role !== 'user' && message.role !== 'assistant') ||
        message.parts.some(
          part =>
            part.type !== 'text' &&
            (message.role !== 'assistant' ||
              (part.type !== 'step-start' && part.type !== 'dynamic-tool')),
        ),
    )
  ) {
    return new Response('Only text and browser tool results are supported.', {
      status: 400,
    });
  }

  const result = streamText({
    model: openai('gpt-6.2-astra'),
    instructions:
      'Help the user understand their shopping cart. Read the cart with the available tool before answering.',
    messages: await convertToModelMessages(validatedMessages.data, { tools }),
    tools,
    abortSignal: request.signal,
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
