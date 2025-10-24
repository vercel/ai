import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { experimental_createMCPClient } from '@ai-sdk/mcp';

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const url = new URL('/mcp/server', requestUrl.origin);
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
      stopWhen: stepCountIs(5),
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are a helpful chatbot capable of basic arithmetic problems',
      messages: convertToModelMessages(messages),
      onFinish: async () => {
        await client.close();
      },
      // Optional, enables immediate clean up of resources but connection will not be retained for retries:
      // onError: async error => {
      //   await client.close();
      // },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
