import { openai } from '@ai-sdk/openai';
import { generateText, createMcpTools, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

/**
 * When running this example:
 *
 * 1. Build the server: npx tsc server.ts --outDir dist --target es2022
 * 2. Run the agent: pnpm tsx src/complex/mcp/agent.ts
 */

const toolSchemas = {
  'get-pokemon': {
    input: z.object({ name: z.string() }),
  },
};

async function main() {
  const pokemonServerToolSet = await createMcpTools<typeof toolSchemas>(
    {
      server: {
        type: 'stdio',
        command: 'node',
        args: ['src/complex/mcp/dist/server.js'],
      },
    },
    toolSchemas,
  );

  const tools = pokemonServerToolSet.tools;

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

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);
