# AI SDK Swarm

> **Warning**
> This is an experimental package. It is not maintained and the API is not stable.

AI SDK Swarm is an experiment to see how something like [OpenAI Swarm](https://github.com/openai/swarm) could be implemented in the AI SDK.

Please note that we are not aiming to exactly re-create OpenAI Swarm in TypeScript, but rather to explore API design choices and how such a system could be built using the AI SDK.

### Basic Example

```tsx
import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';

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
```

### REPL Example

```tsx
import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';
import { CoreMessage } from 'ai';
import * as fs from 'fs';
import * as readline from 'node:readline/promises';
import { z } from 'zod';

type Context = { text: string; speechType?: string; targetLanguage?: string };

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let text = fs.readFileSync('./data/2024-world-series.txt', 'utf8');
const messages: CoreMessage[] = [];

const manager = new Agent<Context>({
  name: 'Manager',
  system: 'You transfer conversations to the appropriate agent.',
  tools: {
    transferToTranslator: {
      type: 'handover',
      parameters: z.object({
        targetLanguage: z.string(),
      }),
      execute: ({ targetLanguage }, { context }) => ({
        agent: translator,
        context: { targetLanguage, text: context.text },
      }),
    },
    transferToSummarizer: {
      type: 'handover',
      parameters: z.object({}),
      execute: () => ({
        agent: summarizer,
      }),
    },
    transferToRewriter: {
      type: 'handover',
      parameters: z.object({}),
      execute: () => ({
        agent: rewriter,
      }),
    },
  },
});

const translator = new Agent<Context>({
  name: 'Translator',
  system: ({ text, targetLanguage }) =>
    `Translate the following text to ${targetLanguage}:\n\n${text}`,
});

const summarizer = new Agent<Context>({
  name: 'Summarizer',
  system: ({ text }) => `Summarize the following text :\n\n${text}`,
});

const rewriter = new Agent<Context>({
  name: 'Rewriter',
  system: ({ text, speechType }) =>
    `Rewrite the following text in ${speechType}:\n\n${text}`,
});

while (true) {
  const { text: updatedText, responseMessages } = await runSwarm({
    agent: manager,
    context: { text },
    model: openai('gpt-4o', { structuredOutputs: true }),
    prompt: [{ role: 'user', content: await terminal.question('You: ') }],
    debug: true,
  });

  messages.push(...responseMessages);
  text = updatedText;

  console.log();
  console.log(text);
  console.log();
}
```
