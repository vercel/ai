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

  const { text, responseMessages } = await runSwarm({
    agent: agentA,
    model: openai('gpt-4o', { structuredOutputs: true }),
    messages: [{ role: 'user', content: 'I want to talk to agent B.' }],
    onStepFinish: async event => {
      console.log(event);
    },
  });

  console.log(text);
  console.log(JSON.stringify(responseMessages, null, 2));
}

main().catch(console.error);
