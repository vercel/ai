import { openai } from '@ai-sdk/openai';
<<<<<<< HEAD
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { experimental_createMCPClient, generateText } from 'ai';
=======
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { experimental_createMCPClient, generateText, stepCountIs } from 'ai';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
import 'dotenv/config';

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/mcp'),
  );

  const mcpClient = await experimental_createMCPClient({
    transport,
  });

  try {
    const tools = await mcpClient.tools();

    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
<<<<<<< HEAD
      maxSteps: 10,
=======
      stopWhen: stepCountIs(10),
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
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
