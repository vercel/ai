import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { experimental_createMCPClient, streamText } from 'ai';

export async function POST(req: Request) {
  const url = new URL('http://localhost:3000/mcp/server');
  const transport = new StreamableHTTPClientTransport(url);

  const [client, { messages }] = await Promise.all([
    experimental_createMCPClient({
      transport,
    }),
    req.json(),
  ]);

  try {
    const tools = await client.tools();

    const result = streamText({
      model: openai('gpt-4o-mini'),
      tools,
      maxSteps: 5,
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are a helpful chatbot capable of basic arithmetic problems',
      messages,
      onFinish: async () => {
        await client.close();
      },
      // Optional, enables immediate clean up of resources but connection will not be retained for retries:
      // onError: async error => {
      //   await client.close();
      // },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
