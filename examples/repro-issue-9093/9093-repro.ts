import { anthropic } from '@ai-sdk/anthropic';
import { Agent, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const agent = new Agent({
    model: anthropic('claude-opus-4-20250514'),
    system:
      'You are a helpful AI assistant with access to web search and webpage content retrieval.',
    tools: {
      webSearch: tool({
        description: 'Get the capital of a country',
        inputSchema: z.object({
          location: z.string().describe('The country to get the capital of'),
        }),
        execute: ({ location }) => ({
          location,
          capital: 'Paris',
        }),
      }),
    },
    stopWhen: stepCountIs(10),
  });

  console.log('Agent created successfully');
  console.log('Starting streaming...\n');
  console.log('='.repeat(50));
  console.log('Response:');
  console.log('='.repeat(50));

  const stream = agent.stream({
    messages: [
      {
        role: 'user',
        content: 'What is the capital of France? use web search',
      },
    ],
  });

  let fullText = '';
  let chunkCount = 0;

  for await (const chunk of stream.textStream) {
    chunkCount++;
    process.stdout.write(chunk);
    fullText += chunk;
  }
}

main().catch(console.error);
