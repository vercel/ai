import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { isStepCount, tool } from 'ai';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

const documentCorpus = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../data/compaction-data.txt',
  ),
  'utf-8',
);

run(async () => {
  const agent = new WorkflowAgent({
    model: openai.responses('gpt-5.4-mini'),
    tools: {
      lookupTopic: tool({
        description: 'Look up the latest notes about a topic.',
        inputSchema: z.object({ topic: z.string() }),
        execute: async ({ topic }) => ({
          topic,
          notes: `${topic} notes were last reviewed this week.`,
        }),
      }),
    },
    providerOptions: {
      openai: {
        store: false,
        contextManagement: [{ type: 'compaction', compactThreshold: 1000 }],
      } satisfies OpenAILanguageModelResponsesOptions,
    },
    stopWhen: isStepCount(3),
  });

  const result = await agent.stream({
    prompt: `Here is a reference guide:\n\n${documentCorpus}\n\nUse the lookupTopic tool to look up "Kubernetes", then summarize what the guide says about it in two sentences.`,
  });

  for (const step of result.steps) {
    console.log(`Step ${step.stepNumber} content:`, step.content);
  }

  console.log('Final text:', result.steps.at(-1)?.text);
});
