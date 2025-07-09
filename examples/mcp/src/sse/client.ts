import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText, stepCountIs } from 'ai';
import 'dotenv/config';

async function main() {
  const mcpClient = await experimental_createMCPClient({
    transport: {
      type: 'sse',
      url: 'http://localhost:8080/sse',
      headers: {
        example: 'header',
      },
    },
  });

  const tools = await mcpClient.tools();

  const { text: answer } = await generateText({
<<<<<<< HEAD
    model: openai('gpt-4o-mini', { structuredOutputs: true }),
    tools,
    maxSteps: 10,
=======
    model: openai('gpt-4o-mini'),
    tools,
    stopWhen: stepCountIs(10),
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    onStepFinish: async ({ toolResults }) => {
      console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
    },
    system: 'You are a helpful chatbot',
    prompt: 'List all products, then find availability for Product 1.',
  });

  await mcpClient.close();

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);
