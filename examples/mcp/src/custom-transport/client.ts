import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { CustomClientTransport } from './transport';

async function main() {
  let mcpClient;

  try {
    const transport = new CustomClientTransport({
      command: 'node',
      args: ['src/custom-transport/dist/server.js'],
    });

    mcpClient = await experimental_createMCPClient({
      transport,
    });

    const tools = await mcpClient.tools({
      schemas: {
        'get-sonny-angel-series': {
          parameters: z.object({ name: z.string() }),
        },
      },
    });

    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini', { structuredOutputs: true }),
      tools,
      maxSteps: 10,
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are an expert in Sonny Angels',
      prompt: 'Can you tell me more about Sonny Angel Animal Series Ver. 1?',
    });

    console.log(`FINAL ANSWER: ${answer}`);
  } catch (error) {
    console.error('Error in MCP client operation:', error);
  } finally {
    await mcpClient?.close();
  }
}

main().catch(console.error);
