import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const mcpClient = await experimental_createMCPClient({
    transport: {
      type: 'sse',
      url: 'http://localhost:8080/sse',
    },
  });

  const { text: answer } = await generateText({
    model: openai('gpt-4o-mini', { structuredOutputs: true }),
    tools: await mcpClient.tools({
      schemas: {
        'find-product': {
          parameters: z.object({}),
        },
      },
    }),
    maxSteps: 10,
    onStepFinish: async ({ toolResults }) => {
      console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
    },
    system: 'You are a helpful chatbot',
    prompt: 'Can you find a product called The Product?',
  });

  await mcpClient.close();

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);
