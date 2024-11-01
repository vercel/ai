import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const agentA = new Agent({
    name: 'Agent A',
    system: 'You are a helpful agent.',
    tools: {
      transferToAgentB: {
        type: 'handover',
        parameters: z.object({}),
        execute: () => ({ agent: agentB }),
      },
    },
  });

  const agentB = new Agent({
    name: 'Agent B',
    system: 'Only speak in Haikus.',
  });

  const { text } = await runSwarm({
    agent: agentA,
    context: {},
    model: openai('gpt-4o', { structuredOutputs: true }),
    prompt: 'I want to talk to agent B.',
  });

  console.log(text);
}

main().catch(console.error);
