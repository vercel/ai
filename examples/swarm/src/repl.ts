import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';
import 'dotenv/config';
import * as fs from 'fs';
import { z } from 'zod';

async function main() {
  type Context = { text: string; speechType?: string; targetLanguage?: string };

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

  const { text } = await runSwarm({
    agent: manager,
    context: {
      text: fs.readFileSync('./data/2024-world-series.txt', 'utf8'),
    },
    model: openai('gpt-4o', { structuredOutputs: true }),
    prompt: `Please translate the text to German.`,
    debug: true,
  });

  console.log(text);
}

main().catch(console.error);
