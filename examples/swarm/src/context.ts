import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';
import 'dotenv/config';

async function main() {
  const agentA = new Agent({
    name: 'Agent A',
    system: 'You are a helpful agent.',
    tools: {
      transferToAgentB: {
        type: 'handover',
        execute: () => ({ agent: agentB }),
      },
    },
  });

  const agentB = new Agent({
    name: 'Agent B',
    system: ({ speechType }: { speechType: string }) =>
      `Only speak in ${speechType}.`,
  });

  const { text } = await runSwarm({
    agent: agentA,
    context: {
      // speechType: 'Haikus',
      // speechType: 'Limericks',
      speechType: 'Sonnets',
    },
    model: openai('gpt-4o', { structuredOutputs: true }),
    prompt: 'I want to talk to agent B.',
  });

  console.log(text);
}

main().catch(console.error);
