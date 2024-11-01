# AI SDK Swarm

> **Warning**
> This is an experimental package. It is not maintained and the API is not stable.

AI SDK Swarm is an experiment to see how something like [OpenAI Swarm](https://github.com/openai/swarm) could be implemented in the AI SDK.

Please note that we are not aiming to exactly re-create OpenAI Swarm in TypeScript, but rather to explore API design choices and how such a system could be built using the AI SDK.

### Example

```tsx
import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';

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
  system: 'Only speak in Haikus.',
});

const { text } = await runSwarm({
  agent: agentA,
  context: {},
  model: openai('gpt-4o', { structuredOutputs: true }),
  prompt: 'I want to talk to agent B.',
});
```
