import { openai } from '@ai-sdk/openai';
import { generateText, createMcpTools } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

/**
 * When running this example:
 *
 * 1. Build the server: npx tsc server.ts --outDir dist --target es2022
 * 2. Run the agent: pnpm tsx src/mcp/agent.ts
 */

const toolSchemas = {
  'get-pokemon': {
    parameters: z.object({ name: z.string() }),
  },
};

async function main() {
  const toolset = await createMcpTools<typeof toolSchemas>({
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['src/mcp/dist/server.js'],
    },
    tools: toolSchemas,
  });

  const tools = toolset.toolSet;
  const cleanup = toolset.cleanup;

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

  await cleanup();

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);
