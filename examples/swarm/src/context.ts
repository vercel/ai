import { openai } from '@ai-sdk/openai';
import { Agent, runSwarm } from '@ai-sdk/swarm';
import 'dotenv/config';
import { z } from 'zod';
import * as fs from 'fs';

async function main() {
  const manager = new Agent<{ text: string }>({
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

  const translator = new Agent<{ text: string; targetLanguage: string }>({
    name: 'Translator',
    system: ({ text, targetLanguage }) =>
      `Translate the following text to ${targetLanguage}:\n\n${text}`,
  });

  const summarizer = new Agent<{ text: string }>({
    name: 'Summarizer',
    system: ({ text }) => `Summarize the following text :\n\n${text}`,
  });

  const rewriter = new Agent<{ speechType: string; text: string }>({
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
    prompt: 'Please summary the text in a few sentences.',
  });

  console.log(text);
}

main().catch(console.error);
