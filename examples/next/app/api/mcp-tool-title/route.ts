import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  convertToModelMessages,
  experimental_createMCPClient,
  stepCountIs,
  streamText,
} from 'ai';

export async function POST(req: Request) {
  const url = new URL('/api/mcp-server', req.url);
  const transport = new StreamableHTTPClientTransport(url);

  const [client, { messages }] = await Promise.all([
    experimental_createMCPClient({
      transport,
    }),
    req.json(),
  ]);

  try {
    const tools = await client.tools();

    console.log('Available tools:', (tools));

    const result = streamText({
      model: openai('gpt-4o-mini'),
      tools,
      stopWhen: stepCountIs(5),
      system: 'You are a helpful assistant with access to tools',
      messages: convertToModelMessages(messages),
      onFinish: async () => {
        await client.close();
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Error in MCP tool title example:', error);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
