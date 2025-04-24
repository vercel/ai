import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/mcp'),
    {
      // NOTE: This does not work right now because upon re-initialization of a HTTP transport + client connection, the client-server re-initialization does not happen again and the server capabilities are thus empty!!!!!!!
      // Optional, if you want to resume a previous session
      //   sessionId: 'b69b3a5e-6511-41ab-9eaa-e7287cfd4300',
    },
  );

  const mcpClient = await experimental_createMCPClient({
    transport,
  });

  const tools = await mcpClient.tools();

  const { text: answer } = await generateText({
    model: openai('gpt-4o-mini', { structuredOutputs: true }),
    tools,
    maxSteps: 10,
    onStepFinish: async ({ toolResults }) => {
      console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
    },
    system: 'You are a helpful chatbot',
    prompt: 'Look up information about user with the ID foo_123',
  });

  await mcpClient.close();

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);
