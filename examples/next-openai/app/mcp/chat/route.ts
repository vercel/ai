import { openai } from '@ai-sdk/openai';
<<<<<<< HEAD
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { experimental_createMCPClient, streamText } from 'ai';
=======
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  convertToModelMessages,
  experimental_createMCPClient,
  stepCountIs,
  streamText,
} from 'ai';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

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
<<<<<<< HEAD
      maxSteps: 5,
=======
      stopWhen: stepCountIs(5),
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are a helpful chatbot capable of basic arithmetic problems',
<<<<<<< HEAD
      messages,
=======
      messages: convertToModelMessages(messages),
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
      onFinish: async () => {
        await client.close();
      },
      // Optional, enables immediate clean up of resources but connection will not be retained for retries:
      // onError: async error => {
      //   await client.close();
      // },
    });

<<<<<<< HEAD
    return result.toDataStreamResponse();
=======
    return result.toUIMessageStreamResponse();
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
