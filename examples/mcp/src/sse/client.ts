import { openai } from '@ai-sdk/openai';
import { generateText, createMcpTools } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const sseToolSchemas = {
  'find-product': {
    parameters: z.object({}),
  },
};

async function main() {
  const { tools, close } = await createMcpTools<typeof sseToolSchemas>({
    transport: {
      type: 'sse',
      url: 'http://localhost:8080/sse',
    },
    tools: sseToolSchemas,
  });

  const { text: answer } = await generateText({
    model: openai('gpt-4o-mini', { structuredOutputs: true }),
    tools,
    maxSteps: 10,
    onStepFinish: async ({ toolResults }) => {
      console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
    },
    system: 'You are a helpful chatbot',
    prompt: 'Can you find a product called The Product?',
  });

  await close();

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);
