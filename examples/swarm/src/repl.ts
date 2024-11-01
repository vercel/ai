import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';
import { CoreMessage } from 'ai';
import 'dotenv/config';
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

async function main() {
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
}

main().catch(console.error);
