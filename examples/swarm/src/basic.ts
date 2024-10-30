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
        agent: () => agentB,
      },
    },
  });

  const agentB = new Agent({
    name: 'Agent B',
    system: 'Only speak in Haikus.',
  });

  const { text } = await runSwarm({
    agent: agentA,
    model: openai('gpt-4o'),
    messages: [{ role: 'user', content: 'I want to talk to agent B.' }],
  });

  console.log(text);
}

main().catch(console.error);
