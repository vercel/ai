import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText } from 'ai';
// import { StdioClientTransport } from 'ai/mcp-stdio';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  let mcpClient;

  try {
    // Or use the AI SDK's stdio transport by importing:
    // import { StdioClientTransport } from 'ai/mcp-stdio';
    const stdioTransport = new StdioClientTransport({
      command: 'node',
      args: ['src/stdio/dist/server.js'],
    });

    mcpClient = await experimental_createMCPClient({
      transport: stdioTransport,
    });

    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini', { structuredOutputs: true }),
      tools: await mcpClient.tools({
        schemas: {
          'get-pokemon': {
            parameters: z.object({ name: z.string() }),
          },
        },
      }),
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
    await mcpClient?.close();
  }
}

main().catch(console.error);
