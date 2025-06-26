import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

main().catch(console.error);

async function main() {
  const agentA = {
    system: 'You are a helpful agent.',
    activeTools: ['transferToAgentB'] as 'transferToAgentB'[],
  };

  const agentB = {
    system: 'Only speak in Haikus.',
    activeTools: [],
  };

  let activeAgent = agentA;

  const result = streamText({
    model: openai('gpt-4o'),
    tools: {
      transferToAgentB: tool({
        description: 'Transfer to agent B.',
        inputSchema: z.object({}),
        execute: async () => {
          activeAgent = agentB;
          return 'Transferred to agent B.';
        },
      }),
    },
    stopWhen: stepCountIs(5),
    prepareStep: () => activeAgent,
    prompt: 'I want to talk to agent B.',
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}
