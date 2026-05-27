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
    // subagents are tools, because this is how they are invoked by the main agent,
    // and prevents naming conflicts while also leveraging all the infrastructure
    // for tools such as tool approval, streaming, etc.
    researcher: subagent({
      description:
        'A helpful researcher that can research topics and questions in depth.',

      // optional instructions for the subagent
      instructions: 'You are a helpful news researcher.',

      // subagents have structured inputs (the invoking agent generates the input tool call)
      inputSchema: z.object({
        topic: z.string().describe('The topic to research'),
      }),

      // the tool input and message history are mapped to the subagent's prompt
      prompt: ({ topic }, { messages }) => [
        ...messages,
        {
          role: 'user',
          content: `Research the topic: ${topic}.`,
        },
      ],

      // alternative: just map the prompt to a string (no message history)
      // prompt: ({ topic }) => `Research the topic: ${topic}.`,

      // by default, subagents return text, but you can also return a structured output
      output: Output.array({
        element: z.object({
          title: z.string(),
          description: z.string(),
          url: z.string(),
        }),
      }),

      // subagents can have their own model
      model: openai('gpt-5-mini'),

      // subagents have tools
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
