import { openai } from '@ai-sdk/openai';
import { tool, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';
import { z } from 'zod';

const researcherAgent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  instructions: 'You are a helpful researcher.',
  tools: {
    websearch: openai.tools.webSearch(),
  },
});

const mainAgent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  instructions: 'You are a helpful assistant.',
  tools: {
    researcher: tool({
      description: 'Research a topic or question in depth.',
      inputSchema: z.object({
        topic: z.string().describe('The topic to research'),
      }),
      execute: async ({ topic }) => {
        const result = await researcherAgent.generate({
          prompt: topic,
        });
        return result.text;
      },
    }),
  },
});

run(async () => {
  const result = await mainAgent.generate({
    prompt: 'What happened in London yesterday? give me the top 10 news items.',
  });

  print('CONTENT:', result.content);
});
