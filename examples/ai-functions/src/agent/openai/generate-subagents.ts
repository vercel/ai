import { openai } from '@ai-sdk/openai';
import { Output, ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';
import { subagent } from '../../lib/subagent';

const mainAgent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  instructions: 'You are a helpful assistant.',
  tools: {
    researcher: subagent({
      description:
        'A helpful researcher that can research topics and questions in depth.',
      inputSchema: z.object({
        topic: z.string().describe('The topic to research'),
      }),

      model: openai('gpt-5-mini'),
      output: Output.array({
        element: z.object({
          title: z.string(),
          description: z.string(),
          url: z.string(),
        }),
      }),
      instructions: 'You are a helpful news researcher.',
      prompt: ({ topic }) => `Research the topic: ${topic}.`,
      tools: {
        websearch: openai.tools.webSearch(),
      },
    }),
  },
});

run(async () => {
  const result = await mainAgent.generate({
    prompt: 'What happened in London yesterday? top 3 news items',
  });

  print('CONTENT:', result.content);
});
