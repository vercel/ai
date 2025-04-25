import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/mcp'),
    {
      // Optional: Session ID for the connection. Used to identify the session on the server.
      // NOTE: This will not work if MCP client is configured with enforceStrictMode set to `true` because initialization is skipped when resuming a session, and server capabilities will be unknown
      //   sessionId: '162d0a7d-3aa7-4f55-a33c-94ec1cca96e0',
    },
  );

  const mcpClient = await experimental_createMCPClient({
    transport,
  });

  try {
    const tools = await mcpClient.tools();

    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      maxSteps: 10,
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are a helpful chatbot',
      prompt: 'Look up information about user with the ID foo_123',
    });

    console.log(`FINAL ANSWER: ${answer}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mcpClient.close();
  }
}

main();
