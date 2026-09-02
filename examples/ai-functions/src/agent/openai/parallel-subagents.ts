import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

type Finding = { topic: string; summary: string };

const KNOWLEDGE_BASE: Record<string, string> = {
  'prompt caching':
    'Prompt caching reuses recently sent tokens on the provider side, cutting input cost up to 90% on repeated prefixes.',
  'tool calling':
    'Tool calling lets the model emit structured invocations the host executes and returns results for in subsequent turns.',
  streaming:
    'Streaming returns tokens incrementally so users see the response as it is generated, lowering perceived latency.',
};

const researchSubagent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  instructions: `You are a research agent. Use the lookup tool to gather information about the topic, then write ONE concise sentence summarizing the finding as your final answer.`,
  tools: {
    lookup: tool({
      description: 'Look up an entry from the internal knowledge base.',
      inputSchema: z.object({
        topic: z.string().describe('The topic to look up.'),
      }),
      execute: ({ topic }) => {
        const entry = KNOWLEDGE_BASE[topic.toLowerCase()];
        return entry ?? `No entry found for "${topic}".`;
      },
    }),
  },
  stopWhen: isStepCount(3),
});

const parentAgent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  instructions: `You orchestrate research across multiple topics.
When asked about several topics, call researchTopics ONCE with all topics in a single array — they are researched in parallel.
After getting the results, present them to the user as a numbered list.`,
  tools: {
    researchTopics: tool({
      description:
        'Research multiple topics in parallel. Use this once with all topics in a single call.',
      inputSchema: z.object({
        topics: z
          .array(z.string())
          .describe('The topics to research, processed concurrently.'),
      }),
      execute: async ({ topics }, { abortSignal }) => {
        console.time('parallel-research');
        const findings: Finding[] = await Promise.all(
          topics.map(async topic => {
            const result = await researchSubagent.generate({
              prompt: topic,
              abortSignal,
            });
            return { topic, summary: result.text };
          }),
        );
        console.timeEnd('parallel-research');
        return findings;
      },
      // Compress the per-topic findings into a single bulleted block so the
      // parent model sees a compact summary instead of structured JSON.
      toModelOutput: ({ output }: { output: Finding[] }) => ({
        type: 'text',
        value: output
          .map(({ topic, summary }) => `- ${topic}: ${summary}`)
          .join('\n'),
      }),
    }),
  },
  stopWhen: isStepCount(3),
});

run(async () => {
  const result = await parentAgent.generate({
    prompt:
      'Compare prompt caching, tool calling, and streaming. One sentence each.',
  });

  print('Final answer:', result.text);
  print('Steps:', result.steps.length);
  print('Total usage:', result.usage);
});
