import { openai } from '@ai-sdk/openai';
import { generateText, createMcpTools } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const stdioToolSchemas = {
  'get-pokemon': {
    parameters: z.object({ name: z.string() }),
  },
};

async function main() {
  const { tools, close } = await createMcpTools<typeof stdioToolSchemas>({
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['src/stdio/dist/server.js'],
    },
    tools: stdioToolSchemas,
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
      'Which 3 Pokemon could best defeat Feebas? Give me more details about each one.',
  });

  await close();

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);
