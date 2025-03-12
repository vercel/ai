import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const stdioToolSchemas = {
  'get-pokemon': {
    parameters: z.object({ name: z.string() }),
  },
};

async function main() {
  let client;

  try {
    client = await experimental_createMCPClient({
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['src/stdio/dist/server.js'],
      },
    });

    const tools = await client.tools({
      schemas: stdioToolSchemas,
    });

    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini', { structuredOutputs: true }),
      tools,
      maxSteps: 10,
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are an expert in Pokemon',
      prompt:
        'Which Pokemon could best defeat Feebas? Choose one and share details about it.',
    });

    console.log(`FINAL ANSWER: ${answer}`);
  } finally {
    await client?.close();
  }
}

main().catch(console.error);
